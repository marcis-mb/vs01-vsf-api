import { Router } from 'express';
import request from 'request';

module.exports = ({ config }) => {
  const api = Router();

  api.get('/current', (req, res) => {
    const { airQuality, key } = config.extensions.weather;

    const location = 'London';
    const url = 'https://api.weatherapi.com/v1/current.json';

    request(
      {
        url,
        json: true,
        qs: {
          q: location,
          aqi: airQuality,
          key: key
        }
      },
      (error, response, body) => {
        let apiResult;
        const errorResponse = error || body.error;

        if (errorResponse) {
          apiResult = { code: 500, result: errorResponse };
        } else {
          apiResult = {
            code: 200,
            result: {
              temp_c: body.current.temp_c,
              wind_kph: body.current.wind_kph,
              wind_dir: body.current.wind_dir
            }
          };
        }
        res.status(apiResult.code).json(apiResult);
      }
    );
  });

  api.get('/forecast', (req, res) => {
    const { airQuality, alerts, key } = config.extensions.weather;

    const location = 'London';
    const date = '2021-07-20';
    const url = 'https://api.weatherapi.com/v1/forecast.json';
    const numOfDays = date === '' ? 3 : 1;

    request(
      {
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
      },
      (error, response, body) => {
        let apiResult;
        const errorResponse = error || body.error;

        if (errorResponse) {
          apiResult = { code: 500, result: errorResponse };
        } else {
          apiResult = { code: 200, result: {} };
          for (let i = 0; i < numOfDays; i++) {
            let dayData = body.forecast.forecastday[i].day;
            apiResult.result[i] = {
              date: date,
              mintemp_c: dayData.mintemp_c,
              maxtemp_c: dayData.maxtemp_c,
              maxwind_kph: dayData.maxwind_kph,
              daily_chance_of_rain: dayData.daily_chance_of_rain,
              daily_chance_of_snow: dayData.daily_chance_of_snow
            }
          }
        }
        res.status(apiResult.code).json(apiResult);
      }
    );
  });

  return api;
};
