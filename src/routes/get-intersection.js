import Joi from '@hapi/joi'
import moment from 'moment'
import restifyErrors from 'restify-errors'
import { Location } from '../models/index.js'
import { logger } from '../libs/index.js'
import { dump } from '../utils/index.js'

const { InvalidArgumentError } = restifyErrors
const {
  INTERSECTION_DELTA_MINUTES,
  INTERSECTION_DISTANCE,
  INTERSECTION_PAST_DAYS,
} = process.env

export default async (req, res) => {
  try {
    const schema = Joi.object().keys({
      uuid: Joi.string().required(),
    })

    const { error, value } = schema.validate(req.query)

    if (error) {
      const errMsg = error.details.map((detail) => detail.message).join('. ')

      throw new InvalidArgumentError(errMsg)
    }

    const intersectedUUID = {}
    const intersectionResult = []

    await Location.aggregate([
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
          createdAt: true,
        },
      },
      {
        $match: {
          $and: [{
            uuid: {
              $eq: value.uuid,
            },
          }, {
            createdAt: {
              $gt: moment().subtract(INTERSECTION_PAST_DAYS, 'days').toDate(),
            },
          }],
        },
      },
    ])
      .cursor({ batchSize: 1000 })
      .exec()
      .eachAsync(async doc => {
        const date = moment(doc.createdAt).format('YYYY-MM-DD')
        if (!intersectedUUID[date]) {
          intersectedUUID[date] = []
        }

        const intersected = await Location.aggregate([
          {
            $geoNear: {
              near: {
                type: 'Point',
                coordinates: [doc.location.coordinates[0], doc.location.coordinates[1]],
              },
              query: {
                createdAt: {
                  $gt: moment(doc.createdAt).subtract(INTERSECTION_DELTA_MINUTES, 'minutes').toDate(),
                  $lt: moment(doc.createdAt).add(INTERSECTION_DELTA_MINUTES, 'minutes').toDate(),
                },
              },
              distanceField: 'distance',
              spherical: true,
              maxDistance: parseInt(INTERSECTION_DISTANCE, 10),
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
              location: {
                coordinates: true,
              },
              date: { $dateToString: { format: '%Y-%m-%d', date: '$time' } },
            },
          },
          {
            $match: {
              $and: [{
                uuid: { $ne: value.uuid },
              }, {
                uuid: { $nin: intersectedUUID[date] },
              }],
            },
          },
          {
            $group: {
              _id: '$date',
              count: { '$sum': 1 },
              uuid: { $push: '$uuid' },
            },
          },
          {
            $project: {
              _id: false,
              count: true,
              date: '$_id',
              uuid: true,
            },
          },
        ])

        intersectedUUID[date] = [...intersectedUUID[date], ...intersected[0].uuid]

        const intersectionAtDate = intersectionResult.find(x => x.date === date)

        if (intersectionAtDate) {
          intersectionAtDate.count += intersected[0].count
        } else {
          intersectionResult.push(...intersected)
        }

        return intersected
      })

    res.setHeader('Content-Type', 'application/json')
    return res.json(intersectionResult.map(dump.dumpIntersection))
  } catch (err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
