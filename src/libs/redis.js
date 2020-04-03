import redis from 'redis'
import logger from './logger.js'

const client = redis.createClient()

client.on('connect', () => {
  logger.info('[REDIS] Connected to redis')
})

client.on('error', err => {
  logger.error(err)
})

export const getAsync = key => new Promise(
  (res, rej) => client.select(1, switchDbErr => {
    if (switchDbErr) {
      rej(switchDbErr)
    }

    client.get(key, (err, reply) => {
      if (err) {
        rej(err)
      }
      try {
        return res(JSON.parse(reply))
      } catch (e) {
        return res(reply)
      }
    })
  }),
)

export const setAsync = (key, value) => new Promise(
  (res, rej) => client.select(1, switchDbErr => {
    if (switchDbErr) {
      rej(switchDbErr)
    }

    client.set(key, JSON.stringify(value), 'EX', 60 * 60 * 24, err => err ? rej(err) : res())
  }),
)

export const setExcludeAsync = key => new Promise(
  (res, rej) => client.select(2, switchDbErr => {
    if (switchDbErr) {
      rej(switchDbErr)
    }

    client.set(key, key, 'EX', 60 * 60 * 24, err => err ? rej(err) : res())
  }),
)

export const getExcludeAsync = key => new Promise(
  (res, rej) => client.select(2, switchDbErr => {
    if (switchDbErr) {
      rej(switchDbErr)
    }

    client.get(key, (err, reply) => {
      if (err) {
        rej(err)
      }
      res(reply)
    })
  }),
)

export default client

