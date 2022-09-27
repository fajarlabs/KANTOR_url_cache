const express = require('express');
const bodyParser = require('body-parser');
const redis = require("redis");
const request = require('request');

const app = express();
const port = 8189;

app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

let redisClient;
(async () => {
  redisClient = redis.createClient();
  redisClient.on("error", (error) => console.error(`Error : ${error}`));
  await redisClient.connect();
})();

const getCache = async (req, res, next) => {

  const key = req.query.key
  const url = Buffer.from(req.query.url, 'base64').toString('ascii')
  const expr = parseInt(req.query.expire)

  try {
    const cacheResults = await redisClient.get(key);
    // check redis from cache
    if (cacheResults) {
      // expose data
      res.set('Content-Type', 'text/plain');
      res.send(cacheResults);
    } else {
      var options = {
        'method': 'GET',
        'url': url,
        'headers': {}
      };
      request(options, function (error, response) {
        if (error) {
        } else {
          // save into cache
          redisClient.set(key, response.body, {
            EX: expr,
            NX: true,
          });
          // expose data
          res.set('Content-Type', 'text/plain');
          res.send(response.body);
        }
      });
    }
  } catch (e) {
    res.set('Content-Type', 'text/plain');
    res.send('No data');
  }
}

app.get('/', (req, res) => {
  res.json({ info: 'Proxy for Helper High Load API' });
});

app.get('/getCache', getCache)

app.listen(port, () => {
  console.log(`App running on port ${port}.`);
});
