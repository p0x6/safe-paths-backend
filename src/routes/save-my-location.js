import Joi from '@hapi/joi'
import { Location, Device } from '../models/index.js'
import { logger } from '../libs/index.js'
import { dump, validator } from '../utils/index.js'

export default async (req, res) => {
  try {
    const data = validator.validate(
      req.body,
      Joi.object().keys({
        uuid: Joi.string().required(),
        coordinates: Joi.object().keys({
          longitude: Joi.number().min(-180).max(180).required(),
          latitude: Joi.number().min(-90).max(90).required(),
        }),
      }),
    )

    let device = await Device.findOne({
      uuid: data.uuid,
    })

    if (!device) {
      device = await new Device({
        uuid: data.uuid,
      }).save()
    }

    await new Location({
      device: device._id,
      location: {
        type: 'Point',
        coordinates: [
          data.coordinates.longitude,
          data.coordinates.latitude,
        ],
      },
    }).save()

    return res.sendStatus(204)
  } catch(err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
