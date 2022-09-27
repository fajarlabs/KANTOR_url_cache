const express = require('express');
const bodyParser = require('body-parser');
const redis = require("redis");
const request = require('request');

const app = express();
const port = 8189;
const history_call = [];

app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

var redisClient;

(async () => {
  redisClient = redis.createClient();
  redisClient.on("error", (error) => console.error(`Error : ${error}`));
  await redisClient.connect();

  // auto checking value expired
  setInterval(() => {
    for (const hc of history_call) {
      (async () => {
        let val = await redisClient.get(hc.key)
        if (val) {
        } else {
          console.log(`Re-new key : ${hc.key}`)
          callGet(hc.key, hc.url, hc.expire, (response) => {
            // do something
          })
        }
      })()
    }
  }, 1000);
})();

/**
 * Function request GET
 * @param {string} key 
 * @param {string} url 
 * @param {integer} expire 
 * @param {function} calback 
 */
const callGet = (key, url, expire, calback) => {
  var options = {
    'method': 'GET',
    'url': url,
    'headers': {}
  };
  request(options, function (error, response) {
    if (error) {
      calback(error)
    } else {
      // save into cache
      redisClient.set(key, response.body, {
        EX: expire,
        NX: true,
      });
      calback(response.body)
    }
  });
}

/**
 * Function URL cache
 * @param {object} req 
 * @param {object} res 
 * @param {object} next 
 */
const getCache = async (req, res, next) => {

  const key = req.query.key
  const url = Buffer.from(req.query.url, 'base64').toString('ascii')
  const expire = parseInt(req.query.expire)

  if (history_call.length > 0) {
    history_call.forEach((value, index, array) => {
      if (value.key == key && value.url == url) {
      } else {
        history_call.push({ "key": key, "url": url, "expire": expire })
      }
    })
  } else {
    history_call.push({ "key": key, "url": url, "expire": expire })
  }

  try {
    const cacheResults = await redisClient.get(key);
    // check redis from cache
    if (cacheResults) {
      // expose data
      res.set('Content-Type', 'text/plain');
      res.send(cacheResults);
    } else {
      // request & expose data
      callGet(key, url, expire, (response) => {
        res.set('Content-Type', 'text/plain');
        res.send(response);
      })
    }
  } catch (e) {
    console.log(e)
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
