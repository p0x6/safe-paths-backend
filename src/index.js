import 'dotenv/config.js'
import http from 'http'
import express from 'express'
import bodyParser from 'body-parser'
import { logger } from './libs/index.js'
import api from './api.js'
import { fileURLToPath } from 'url'
import path from 'path'

/* eslint-disable */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
/* eslint-enable */

// dotenv.config({
//   path: path.join(__dirname, '..', process.env.NODE_ENV === 'test' ? '.env.test' : '.env')
// })

const {
  API_PREFIX,
  HTTP_HOST,
  PORT = 3000,
} = process.env

// console.log('####',HTTP_HOST, process.env.NODE_ENV)

export const app = express()

app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json())
// app.use(logger.middleware)

app.use(API_PREFIX, api)

// eslint-disable-next-line
app.use((req, res, next) => {
  res.status(404).send('Not found')
})

// eslint-disable-next-line
app.use((err, req, res, next) => {
  logger.error(`Error: ${err} ${err.stack}`)
  res.status(502).send('Internal server error')
})

const httpServer = http.createServer(app)

const onReady = () => {
  logger.info(`🚀 Server ready at http://${HTTP_HOST}:${PORT}`)
}

httpServer.listen(PORT, HTTP_HOST, onReady)
