import express from 'express'
import {
  saveMyLocation,
  getUserPositions,
  getIntersection,
  cors,
} from './routes/index.js'

const { Router } = express
const router = Router()

router.use(cors)

router.route('/get-user-positions').get(getUserPositions)
router.route('/get-intersection').get(getIntersection)
router.route('/save-my-location').post(saveMyLocation)

export default router
