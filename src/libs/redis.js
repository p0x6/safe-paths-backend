import redis from 'redis'
import logger from './logger.js'

const { REDIS_URI } = process.env

const client = redis.createClient({
  url: REDIS_URI,
})

client.on('connect', () => {
  logger.info('[REDIS] Connected to redis')
})

client.on('error', err => {
  logger.error(err)
})

export const getAsync = key => new Promise(
  (res, rej) => client.get(key, (err, reply) => {
    if (err) {
      rej(err)
    }
    try {
      return res(JSON.parse(reply))
    } catch (e) {
      return res(reply)
    }
  }),
)

export const setAsync = (key, value) => new Promise(
  (res, rej) => client.set(key, JSON.stringify(value), 'EX', 60 * 60 * 24, err => err ? rej(err) : res()),
)

export default client

