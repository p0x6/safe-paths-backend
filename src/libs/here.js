import axios from 'axios'
import logger from './logger.js'

const HERE_API_URL = 'https://route.ls.hereapi.com'
const { HERE_API_KEY } = process.env

export default async (startLocation, endLocation, avoidAreas = []) => {
  try {
    const { data } = await axios.get(
      `${HERE_API_URL}/routing/7.2/calculateroute.json?apiKey=${HERE_API_KEY}&waypoint0=geo!${startLocation.join(',')}&waypoint1=geo!${endLocation.join(',')}&mode=fastest;pedestrian${avoidAreas.length > 0 ? `&avoidareas=${avoidAreas.map(area => area.map(points => points.join(',')).join(';')).join('!')}` : ''}`,
    )

    return data
  } catch(e) {
    logger.error(e.data || e.message)
    throw e
  }
}
