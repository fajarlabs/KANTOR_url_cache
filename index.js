const express = require('express');
const bodyParser = require('body-parser');
const redis = require("redis");
const request = require('request');

const app = express();
// webservice port
const port = 8189;
// support parsing of application/json type post data
app.use(bodyParser.json());
// support parsing of application/x-www-form-urlencoded post data
app.use(bodyParser.urlencoded({ extended: true }));
// history call url
const history_call = [];

(async () => {
  global.redisClient = redis.createClient({
    host: 'localhost',
    port: 6379
  });

  global.redisClient.on("error", (error) => console.error(`Error : ${error}`));
  await global.redisClient.connect();

  // auto checking value expired
  setInterval(() => {
    for (const hc of history_call) {
      (async () => {
        let val = await global.redisClient.get(hc.key)
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
 * Get headers
 * @param {object} res 
 * @param {string} content_type 
 */
const getHeader = (res, content_type) => {
  if (content_type == 'json') { // response json
    res.setHeader('Content-Type', 'application/json');
  } else if (content_type == 'html') { // response html
    res.setHeader('Content-Type', 'text/html');
  } else if (content_type == 'csv') { // response csv
    res.setHeader('Content-Type', 'text/csv')
  } else if (content_type == 'xml') { // response csv
    res.setHeader('Content-Type', 'text/xml')
  } else {
    res.setHeader('Content-Type', 'text/plain'); // response text
  }
}

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
      try {
        global.redisClient.set(key, response.body, {
          EX: expire,
          NX: true,
        });
        calback(response.body)
      } catch (e) {
        calback(e)
      }
    }
  });
}

/**
 * Function URL cache
 * @param {object} req 
 * @param {object} res 
 * @param {object} next 
 */
const getProxyCache = async (req, res, next) => {

  const key = req.query.key
  const url = Buffer.from(req.query.url, 'base64').toString('ascii')
  const expire = parseInt(req.query.expire)
  const content_type = req.query.content_type

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
    const cacheResults = await global.redisClient.get(key);
    // check redis from cache
    if (cacheResults) {
      // expose data
      getHeader(res, content_type)
      res.send(cacheResults);
    } else {
      // request & expose data
      callGet(key, url, expire, (response) => {
        getHeader(res, content_type)
        res.send(response);
      })
    }
  } catch (e) {
    console.log(e)
    getHeader(res, content_type)
    res.send(e);
  }
}

/**
 * Function set cache
 * @param {express} req 
 * @param {express} res 
 * @param {express} next 
 */
const setCache = async (req, res, next) => {
  const key = req.body.key
  const content_type = req.body.content_type
  const content = req.body.content
  const expire = parseInt(req.body.expire)

  try {
    global.redisClient.set(key, content, {
      EX: expire,
      NX: true,
    });
    getHeader(res, content_type)
    res.send('Success');
  } catch (e) {
    getHeader(res, content_type)
    res.send(e);
  }
}

/**
 * Get cache function
 * @param {express} req 
 * @param {express} res 
 * @param {express} next 
 */
const getCache = async (req, res, next) => {
  try {
    const key = req.query.key
    const content_type = req.query.content_type
    const cacheResults = await global.redisClient.get(key);
    // check redis from cache
    if (cacheResults) {
      getHeader(res, content_type)
      res.send(cacheResults);
    } else {
      getHeader(res, content_type)
      res.send('No data');
    }
  } catch (e) {
    console.log(e)
    getHeader(res, content_type)
    res.send(e);
  }
}

/**
 * Index function
 * @param {express} req 
 * @param {express} res 
 */
const getIndex = async (req, res) => {
  res.json({ info: 'Proxy for Helper High Load API' });
}

app.get('/', getIndex)
app.get('/getProxyCache', getProxyCache)
app.post('/set', setCache)
app.get('/get', getCache)

app.listen(port, () => {
  console.log(`App running on port ${port}.`);
});
