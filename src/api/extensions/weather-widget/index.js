import { Router } from 'express';
import request from 'request';
import cache from '../../../lib/cache-instance'
import {sha3_224} from 'js-sha3';
import {apiError} from '../../../lib/util';

async function cacheStorageHandler (config, result, hash, tags) {
  if (config.server.useOutputCache && cache) {
    return cache.set(
      'weather-api:' + hash,
      result,
      tags,
      {
        timeout: 180 /* Cache for 3 min */
      }
    ).catch((err) => {
      console.error(err)
    })
  }
}

module.exports = ({ config }) => {
  const api = Router();
  const s = Date.now();
  const dynamicRequestHandler = (requestBody, requestType, res, reqHash, tagsArray, numOfDays) => {
    try {
      request(
        requestBody,
        (error, response, body) => {
          let apiResult;
          const errorResponse = error || body.error;
          if (errorResponse) {
            apiResult = { code: 500, result: errorResponse };
          } else {
            if (requestType === 'current') {
              apiResult = {
                code: 200,
                result: {
                  temp_c: body.current.temp_c,
                  wind_kph: body.current.wind_kph,
                  wind_dir: body.current.wind_dir
                }
              };
            } else {
              apiResult = { code: 200, result: {} };
              for (let i = 0; i < numOfDays; i++) {
                let dayData = body.forecast.forecastday[i].day;
                apiResult.result[i] = {
                  date: body.forecast.forecastday[i].date,
                  mintemp_c: dayData.mintemp_c,
                  maxtemp_c: dayData.maxtemp_c,
                  maxwind_kph: dayData.maxwind_kph,
                  daily_chance_of_rain: dayData.daily_chance_of_rain,
                  daily_chance_of_snow: dayData.daily_chance_of_snow
                }
              };
            }
          }
          res.status(apiResult.code).json(apiResult);
          if (config.get('varnish.enabled')) {
            // Add tags to cache, so we can display them in response headers then
            cacheStorageHandler(config, {
              ...body,
              tags: tagsArray
            }, reqHash, tagsArray)
          } else {
            cacheStorageHandler(config, apiResult, reqHash, tagsArray)
          }
        }
      );
    } catch (err) {
      apiError(res, err)
    }
  }

  const getData = (requestBody, requestType, req, res, reqHash, tagsArray, numOfDays = 3) => {
    if (config.server.useOutputCache && cache) {
      //cache.invalidate(requestType);
      cache.get(
        'weather-api:' + reqHash
      ).then(output => {
        if (output !== null) {
          res.setHeader('X-VS-Cache', 'Hit')
          if (config.get('varnish.enabled')) {
            const tagsHeader = output.tags.join(' ')
            res.setHeader('X-VS-Cache-Tag', tagsHeader)
            delete output.tags
          }
          res.json(output)
          console.log(`cache hit [${req.url}], cached request: ${Date.now() - s}ms`)
        } else {
          res.setHeader('X-VS-Cache', 'Miss')
          console.log(`cache miss [${req.url}], request: ${Date.now() - s}ms`)
          dynamicRequestHandler(requestBody, requestType, res, reqHash, tagsArray, numOfDays);
        }
      }).catch(err => console.error(err))
    } else {
      dynamicRequestHandler(requestBody, requestType, res, reqHash, tagsArray, numOfDays);
    }
  }

  api.get('/current', (req, res) => {
    const requestType = 'current';
    const tagsArray = [requestType];
    const { airQuality, key } = config.extensions.weather;
    const location = 'London';
    const url = 'https://api.weatherapi.com/v1/current.json';
    const requestBody = {
      url,
      json: true,
      qs: {
        q: location,
        aqi: airQuality,
        key: key
      }
    };
    const reqHash = sha3_224(`${JSON.stringify(requestBody)}${req.url}`);
    getData(requestBody, requestType, req, res, reqHash, tagsArray);
  });

  api.get('/forecast', (req, res) => {
    const requestType = 'forecast';
    const { date } = req.query;
    const isSingleForecast = date !== '';
    const tagsArray = [requestType, isSingleForecast ? 'singleDay' : 'multiDay'];
    const { airQuality, alerts, key } = config.extensions.weather;
    const location = 'London';
    const url = 'https://api.weatherapi.com/v1/forecast.json';
    const numOfDays = isSingleForecast ? 1 : 3;
    const requestBody = {
      url,
      json: true,
      qs: {
        q: location,
        alerts: alerts,
        aqi: airQuality,
        days: numOfDays,
        dt: date,
        key: key
      }
    };
    const reqHash = sha3_224(`${JSON.stringify(requestBody)}${req.url}`);
    getData(requestBody, requestType, req, res, reqHash, tagsArray, numOfDays);
  });

  return api;
};
