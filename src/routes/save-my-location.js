import Joi from '@hapi/joi'
import restifyErrors from 'restify-errors'
import { Location, Device } from '../models/index.js'
import { logger } from '../libs/index.js'
import { dump } from '../utils/index.js'

const { InvalidArgumentError } = restifyErrors

export default async (req, res) => {
  try {
    const schema = Joi.object().keys({
      uuid: Joi.string().required(),
      coordinates: Joi.object().keys({
        longitude: Joi.number().min(-180).max(180).required(),
        latitude: Joi.number().min(-90).max(90).required(),
      }),
    })

    const { error, value } = schema.validate(req.body)

    if (error) {
      const errMsg = error.details.map((detail) => detail.message).join('. ')

      throw new InvalidArgumentError(errMsg)
    }

    const device = await Device.updateOne({
      uuid: value.uuid,
    }, {
      uuid: value.uuid,
    }, {
      upsert: true,
      setDefaultsOnInsert: true,
    })

    await new Location({
      device: device.upserted[0]._id,
      location: {
        type: 'Point',
        coordinates: [
          value.coordinates.longitude,
          value.coordinates.latitude,
        ],
      },
    }).save()

    return res.sendStatus(204)
  } catch(err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
