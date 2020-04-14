import Joi from '@hapi/joi'
import moment from 'moment'
import { Location, Device } from '../models/index.js'
import { logger } from '../libs/index.js'
import { dump, validator } from '../utils/index.js'

const {
  INTERSECTION_DELTA_MINUTES,
  INTERSECTION_DISTANCE,
  INTERSECTION_PAST_DAYS,
} = process.env

export default async (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  try {
    const intersectedUUID = {}
    const intersectionResult = []
    const data = validator.validate(
      req.query,
      Joi.object().keys({
        uuid: Joi.string().required(),
      }),
    )

    for(let i=0;i<7;i++) {
      const date = moment().subtract(i, 'days').format('YYYY-MM-DD')
      intersectedUUID[date] = []
      intersectionResult.push({ date, count: 0 })
    }

    const device = await Device.findOne({
      uuid: data.uuid,
    })

    if (!device) {
      return res.json(intersectionResult.map(dump.dumpIntersection))
    }

    await Location.aggregate([{
      $match: {
        $and: [{
          device: {
            $eq: device._id,
          },
        }, {
          createdAt: {
            $gt: moment().subtract(INTERSECTION_PAST_DAYS, 'days').toDate(),
          },
        }],
      },
    }, {
      $project: {
        _id: false,
        device: true,
        location: true,
        createdAt: true,
      },
    }])
      .cursor({ batchSize: 10000 })
      .exec()
      .eachAsync(async doc => {
        const date = moment(doc.createdAt).format('YYYY-MM-DD')

        const intersected = await Location.aggregate([
          {
            $geoNear: {
              near: {
                type: 'Point',
                coordinates: [doc.location.coordinates[0], doc.location.coordinates[1]],
              },
              query: {
                $and: [{
                  device: { $ne: device._id },
                }, {
                  device: { $nin: intersectedUUID[date] },
                }, {
                  createdAt: {
                    $gt: moment(doc.createdAt).subtract(INTERSECTION_DELTA_MINUTES, 'minutes').toDate(),
                    $lt: moment(doc.createdAt).add(INTERSECTION_DELTA_MINUTES, 'minutes').toDate(),
                  },
                }],
              },
              distanceField: 'distance',
              spherical: true,
              maxDistance: parseInt(INTERSECTION_DISTANCE, 10),
              limit: 100000,
            },
          }, {
            $group: {
              _id: '$device',
              device: { $first: '$device' },
              location: { $first: '$location' },
              time: { $first: '$createdAt' },
            },
          },
          {
            $project: {
              _id: false,
              device: true,
              date: { $dateToString: { format: '%Y-%m-%d', date: '$time' } },
            },
          }, {
            $group: {
              _id: '$date',
              count: { '$sum': 1 },
              device: { $push: '$device' },
            },
          },
        ])

        if (intersected.length > 0 && intersected[0].count > 0) {
          intersectedUUID[date] = [...intersectedUUID[date], ...intersected[0].device]

          const intersectionAtDate = intersectionResult.find(x => x.date === date)
          intersectionAtDate.count += intersected[0].count
        }

        return intersected
      })

    return res.json(intersectionResult.map(dump.dumpIntersection))
  } catch (err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
