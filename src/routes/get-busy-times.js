import Joi from '@hapi/joi'
import { logger } from '../libs/index.js'
import {
  dump,
  validator,
  getBusyHoursBasedOnOwnData,
  getBusyHoursBasedOnGoogleMaps,
} from '../utils/index.js'

export default async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json')
    let busyHours = {}
    const data = validator.validate(
      req.query,
      Joi.object().keys({
        placeId: Joi.string(),
        type: Joi.string().valid('google', 'own'),
      }),
    )

    if (data.type === 'own') {
      busyHours = await getBusyHoursBasedOnOwnData(data.placeId)
    } else {
      busyHours = await getBusyHoursBasedOnGoogleMaps(data.placeId)
    }

    return res.json(busyHours)
  } catch (err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
