import Joi from '@hapi/joi'
import circle from '@turf/circle'
import simplify from '@turf/simplify'
import rotate from '@turf/transform-rotate'
import moment from 'moment-timezone'
import { logger, here } from '../libs/index.js'
import { dump, buildPolygon, buildLinestring, validator } from '../utils/index.js'
import { Location } from '../models/index.js'

const { INTERSECTION_DELTA_MINUTES } = process.env

export default async (req, res) => {
  try {
    const data = validator.validate(
      req.query,
      Joi.object().keys({
        startLatitude: Joi.number().min(-90).max(90).required(),
        startLongitude: Joi.number().min(-180).max(180).required(),
        endLatitude: Joi.number().min(-90).max(90).required(),
        endLongitude: Joi.number().min(-180).max(180).required(),
      }),
    )

    const calculatedRoutes = []
    const avoidPoints = []
    let isRouteSatisfies = false

    while(!isRouteSatisfies) {
      const { response: { route: routes } } = await here(
        [data.startLatitude, data.startLongitude],
        [data.endLatitude, data.endLongitude],
        avoidPoints,
      )

      const results = await Promise.all(routes.map(async route => {
        const routeLinestring = buildLinestring(route.leg[0].maneuver)
        const polygon = buildPolygon(route.leg[0].maneuver)

        const devicesInPolygon = await Location.aggregate([{
          $match: {
            createdAt: {
              $gt: moment().subtract(parseInt(INTERSECTION_DELTA_MINUTES, 10), 'minutes').toDate(),
            },
          },
        }, {
          $match: {
            location: {
              $geoWithin: {
                $geometry: polygon,
              },
            },
          },
        }])

        if (devicesInPolygon.length > 0) {
          const areas = devicesInPolygon
            .map(point =>
              rotate(
                simplify.default(
                  circle.default(point.location.coordinates, 30, { units: 'meters' }),
                  {
                    tolerance: 1,
                    highQuality: true,
                    mutate: true,
                  },
                ),
                45,
              ).geometry.coordinates[0],
            )

          areas.forEach(
            area => avoidPoints.push([area[0].reverse(), area[2].reverse()]),
          )
        }

        return {
          routeLinestring,
          travelTime: route.summary.travelTime,
          distance: route.summary.distance,
          intersections: devicesInPolygon.length,
        }
      }))

      const routeWithoutIntersection = results.find(r => r.intersections === 0)
      if (routeWithoutIntersection) {
        isRouteSatisfies = true

        calculatedRoutes.push(...results)
      } else {
        if (calculatedRoutes.length > 0) {
          const filteredRoutesByTime = results.filter(r => r.travelTime < calculatedRoutes[0].travelTime * 1.5)
          if (filteredRoutesByTime.length !== results.length) {
            calculatedRoutes.push(...filteredRoutesByTime)
            isRouteSatisfies = true
          }
        } else {
          calculatedRoutes.push(...results)
          isRouteSatisfies = false
        }
      }
    }

    // console.dir(calculatedRoutes, { depth: 20, colors: true })
    const routeWithLeastIntersections = calculatedRoutes.reduce(
      (acc, route) => route.intersections < acc.intersections ? route : acc,
      calculatedRoutes[0],
    )

    res.setHeader('Content-Type', 'application/json')
    return res.json(dump.dumpLinestring(routeWithLeastIntersections.routeLinestring))
  } catch (err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
