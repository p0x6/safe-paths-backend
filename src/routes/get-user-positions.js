import Joi from '@hapi/joi'
import moment from 'moment-timezone'
import { Location } from '../models/index.js'
import { logger } from '../libs/index.js'
import { dump, validator } from '../utils/index.js'

const { INTERSECTION_DELTA_MINUTES } = process.env

export default async (req, res) => {
  try {
    const data = validator.validate(
      req.query,
      Joi.object().keys({
        latitude: Joi.number().min(-90).max(90).required(),
        longitude: Joi.number().min(-180).max(180).required(),
        radius: Joi.number().required(),
        uuid: Joi.string().required(),
      }),
    )

    const devicesNearby = await Location.aggregate([{
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [data.longitude, data.latitude],
        },
        distanceField: 'distance',
        spherical: true,
        maxDistance: data.radius,
        limit: 100000,
      },
    }, {
      $match: {
        createdAt: {
          $gt: moment().subtract(parseInt(INTERSECTION_DELTA_MINUTES, 10), 'minutes').toDate(),
        },
      },
    }, {
      $group: {
        _id: '$device',
        device: { $first: '$device' },
        location: { $first: '$location' },
        time: { $first: '$createdAt' },
      },
    }, {
      $lookup: {
        from: 'devices',
        localField: 'device',
        foreignField: '_id',
        as: 'device',
      },
    }, {
      $project: {
        _id: false,
        uuid: { $arrayElemAt: ['$device.uuid', 0] },
        location: true,
        time: { $subtract: ['$time', new Date('1970-01-01')] },
      },
    }, {
      $match: {
        uuid: { $ne: data.uuid },
      },
    }])

    res.setHeader('Content-Type', 'application/json')
    return res.json({
      type: 'FeatureCollection',
      features: devicesNearby.map(dump.dumpUserLocation),
    })
  } catch (err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
