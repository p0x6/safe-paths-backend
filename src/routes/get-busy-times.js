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
      Joi.alternatives().try(
        Joi.object().keys({
          latitude: Joi.number().min(-90).max(90),
          longitude: Joi.number().min(-180).max(180),
          address: Joi.string(),
          name: Joi.string(),
        }),
        Joi.object().keys({
          placeId: Joi.string(),
        }),
      ),
    )

    if (data.placeId) {
      busyHours = await getBusyHoursBasedOnOwnData(data.placeId)
    } else {
      busyHours = await getBusyHoursBasedOnGoogleMaps(
        data.name,
        data.address,
        data.latitude,
        data.longitude,
      )
    }

    return res.json(busyHours)
  } catch (err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
