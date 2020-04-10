import Joi from '@hapi/joi'
import circle from '@turf/circle'
import simplify from '@turf/simplify'
import moment from 'moment-timezone'
import restifyErrors from 'restify-errors'
import { logger, here } from '../libs/index.js'
import { dump, buildPolygon } from '../utils/index.js'
import { Location } from '../models/index.js'

const { InvalidArgumentError } = restifyErrors
const { INTERSECTION_DELTA_MINUTES } = process.env

export default async (req, res) => {
  try {
    const schema = Joi.object().keys({
      startLatitude: Joi.number().min(-90).max(90).required(),
      startLongitude: Joi.number().min(-180).max(180).required(),
      endLatitude: Joi.number().min(-90).max(90).required(),
      endLongitude: Joi.number().min(-180).max(180).required(),
    })

    const { error, value } = schema.validate(req.query)

    if (error) {
      const errMsg = error.details.map((detail) => detail.message).join('. ')

      throw new InvalidArgumentError(errMsg)
    }

    const avoidPoints = []
    let routeSatisfies = false
    let loop =0

    while(!routeSatisfies && loop < 2) {
      const { response } = await here(
        [value.startLatitude, value.startLongitude],
        [value.endLatitude, value.endLongitude],
        avoidPoints,
      )

      const polygon = buildPolygon(response.route[0].leg[0].maneuver)

      console.dir({ polygon }, { depth: 20, colors: true })


      const devicesInPolygon = await Location.aggregate([
        // {
        //   $match: {
        //     createdAt: {
        //       $gt: moment().subtract(parseInt(INTERSECTION_DELTA_MINUTES, 10), 'minutes').toDate(),
        //     },
        //   },
        // },
        {
          $match: {
            location: {
              $geoWithin: {
                $geometry: polygon,
              },
            },
          },
        }])

      if (devicesInPolygon.length > 0) {
        routeSatisfies = false

        const areas = devicesInPolygon
          .map(point =>
            simplify.default(
              circle.default(point.location.coordinates, 10, { units: 'meters' }),
              {
                tolerance: 1,
                highQuality: true,
                mutate: true,
              },
            ).geometry.coordinates[0],
          )

        areas.forEach(area => {
          avoidPoints.push([area[0].reverse(), area[2].reverse()])
        })
      } else {
        routeSatisfies = true
      }

      loop++

      console.dir({ avoidPoints }, { depth: 20, colors: true })
    }

    res.setHeader('Content-Type', 'application/json')
    return res.json({})
  } catch (err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
