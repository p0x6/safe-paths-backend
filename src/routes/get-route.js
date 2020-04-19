import Joi from '@hapi/joi'
import buffer from '@turf/buffer'
import moment from 'moment-timezone'
import { logger, openroute } from '../libs/index.js'
import { dump, validator } from '../utils/index.js'
import { Location } from '../models/index.js'

const { INTERSECTION_DELTA_MINUTES } = process.env
const FIND_ROUTE_RETRIES = 4

export default async (req, res) => {
  res.setHeader('Content-Type', 'application/json')
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
    const avoidPolygons = []
    let isRouteSatisfies = false
    let retries = FIND_ROUTE_RETRIES

    while(!isRouteSatisfies && retries > 0) {
      retries--
      const routes = await openroute(
        [data.startLongitude,data.startLatitude],
        [data.endLongitude, data.endLatitude],
        avoidPolygons,
      )

      const results = await Promise.all(routes.map(async route => {
        const routeLinestring = route.geometry
        const polygon = buffer(route.geometry, 5, { units: 'meters' }).geometry

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
          devicesInPolygon
            .forEach(point =>
              avoidPolygons.push(
                buffer.default({
                  type: 'Point',
                  coordinates: point.location.coordinates,
                },
                30,
                { units: 'meters' },
                ).geometry,
              ),
            )
        }

        return {
          routeLinestring,
          travelTime: route.properties.summary.duration,
          distance: route.properties.summary.distance,
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

    const routeWithLeastIntersections = calculatedRoutes.reduce(
      (acc, route) => route.intersections < acc.intersections ? route : acc,
      calculatedRoutes[0],
    )

    return res.json(dump.dumpLinestring(routeWithLeastIntersections.routeLinestring))
  } catch (err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
