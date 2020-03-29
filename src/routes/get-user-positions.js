import Joi from '@hapi/joi'
import restifyErrors from 'restify-errors'
import { Location } from '../models/index.js'
import { logger } from '../libs/index.js'
import { dump } from '../utils/index.js'

const { InvalidArgumentError } = restifyErrors

export default async (req, res) => {
  try {
    const schema = Joi.object().keys({
      latitude: Joi.number().min(-90).max(90).required(),
      longitude: Joi.number().min(-180).max(180).required(),
      radius: Joi.number().required(),
      uuid: Joi.string().required(),
    })

    const { error, value } = schema.validate(req.query)

    if (error) {
      const errMsg = error.details.map((detail) => detail.message).join('. ')

      throw new InvalidArgumentError(errMsg)
    }

    const period = new Date()
    period.setMinutes(period.getMinutes()-5)

    const devicesNearby = await Location.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [value.longitude,value.latitude],
          },
          distanceField: 'distance',
          spherical: true,
          maxDistance: value.radius,
        },
      },
      {
        $match: {
          createdAt: {
            $gt: period,
          },
        },
      },
      {
        $group: {
          _id: '$device',
          device: { $first: '$device' },
          location: { $first: '$location' },
          time: { $first: '$createdAt' },
        },
      },
      {
        $lookup:
          {
            from: 'devices',
            localField: 'device',
            foreignField: '_id',
            as: 'device',
          },
      },
      {
        $project: {
          _id: false,
          uuid: { $arrayElemAt: ['$device.uuid', 0] },
          location: true,
          time: { $subtract: ['$time', new Date('1970-01-01')] },
        },
      },
      {
        $match: {
          uuid: { $ne: value.uuid },
        },
      },
    ])

    res.setHeader('Content-Type', 'application/json')
    return res.json(devicesNearby.map(dump.dumpUserLocation))
  } catch(err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
