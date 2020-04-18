import lineOffset from '@turf/line-offset'
import buildLinestring from './build-linestring.js'

export const buildPolygonForHere = waypoints => {
  const linestring = buildLinestring(waypoints)

  const line1 = lineOffset(linestring, 5, { units: 'meters' }).geometry.coordinates
  const line2 = lineOffset(linestring, -5, { units: 'meters' }).geometry.coordinates.reverse()

  return {
    type: 'Polygon',
    coordinates: [[
      ...line1,
      ...line2,
      line1[0],
    ]],
  }
}

export default linestring => {
  const line1 = lineOffset(linestring, 5, { units: 'meters' }).geometry.coordinates
  const line2 = lineOffset(linestring, -5, { units: 'meters' }).geometry.coordinates.reverse()

  return {
    type: 'Polygon',
    coordinates: [[
      ...line1,
      ...line2,
      line1[0],
    ]],
  }
}
