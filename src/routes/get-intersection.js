import Joi from '@hapi/joi'
import restifyErrors from 'restify-errors'
import { Location } from '../models/index.js'
import { logger } from '../libs/index.js'
import { dump } from '../utils/index.js'

const { InvalidArgumentError } = restifyErrors
const {
  INTERSECTION_TIME,
  INTERSECTION_DISTANCE,
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

    const period = new Date()
    period.setMinutes(period.getMinutes() - 5)

    const intersectedUUID = {}

    const devicesNearby = await Location.aggregate([
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
          uuid: {
            $eq: value.uuid,
          },
        },
      },


      // {

      // },
      // {
      //   $geoNear: {
      //     near: {
      //       type: 'Point',
      //       coordinates: [value.longitude,value.latitude],
      //     },
      //     distanceField: 'distance',
      //     spherical: true,
      //     maxDistance: value.radius,
      //   },
      // },
      // {
      //   $match: {
      //     createdAt: {
      //       $gt: period,
      //     },
      //   },
      // },
      // {
      //   $group: {
      //     _id: '$device',
      //     device: { $first: '$device' },
      //     location: { $first: '$location' },
      //     time: { $first: '$createdAt' },
      //   },
      // },

      // {
      //   $project: {
      //     _id: false,
      //     uuid: { $arrayElemAt: ['$device.uuid', 0] },
      //     location: true,
      //     time: { $subtract: ['$time', new Date('1970-01-01')] },
      //   },
      // },
    ])
      .cursor({ batchSize: 1000 })
      .exec()
      .eachAsync(async doc => {
        // use doc
        console.log('$$$', doc)

        const intersected = await Location.aggregate([
          {
            $geoNear: {
              near: {
                type: 'Point',
                coordinates: [doc.location.coordinates[0], doc.location.coordinates[1]],
              },
              query: {
                createdAt: {
                  $gt: new Date(doc.createdAt - (60 * 1000 * parseInt(INTERSECTION_TIME, 10))),
                  $lt: new Date(doc.createdAt + (60 * 1000 * parseInt(INTERSECTION_TIME, 10))),
                },
              },
              distanceField: 'distance',
              spherical: true,
              maxDistance: parseInt(INTERSECTION_DISTANCE, 10),
            },
          },
          // {
          //   $group: {
          //     _id: '$device',
          //     device: { $first: '$device' },
          //     location: { $first: '$location' },
          //     time: { $first: '$createdAt' },
          //   },
          // },
          // {
          //   $lookup:
          //   {
          //     from: 'devices',
          //     localField: 'device',
          //     foreignField: '_id',
          //     as: 'device',
          //   },
          // },
          // {
          //   $project: {
          //     _id: false,
          //     uuid: { $arrayElemAt: ['$device.uuid', 0] },
          //     location: true,
          //     time: { $subtract: ['$time', new Date('1970-01-01')] },
          //   },
          // },
          {
            $match: {
              uuid: { $ne: value.uuid },
            },
          },
        ])

        console.log('INTERSECTED:', intersected)
      })


    // cursor
    // console.dir(JSON.parse(JSON.stringify(devicesNearby)), { depth: 20, colors: true })

    res.setHeader('Content-Type', 'application/json')
    return res.json(devicesNearby)
  } catch (err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
