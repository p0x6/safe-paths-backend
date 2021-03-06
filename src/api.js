import express from 'express'
import {
  saveMyLocation,
  getUserPositions,
  getIntersection,
  places,
  cors,
  getRoute,
  getBusyTimes,
} from './routes/index.js'

const { Router } = express
const router = Router()

router.use(cors)

router.route('/get-user-positions').get(getUserPositions)
router.route('/get-intersection').get(getIntersection)
router.route('/save-my-location').post(saveMyLocation)
router.route('/places').get(places)
router.route('/get-route').get(getRoute)
router.route('/busy-times').get(getBusyTimes)

export default router
