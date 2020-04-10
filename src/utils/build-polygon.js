import lineOffset from '@turf/line-offset'

export default waypoints => {
  const geojson = {
    type: 'LineString' ,
    coordinates: waypoints.map(waypoint => [waypoint.position.longitude, waypoint.position.latitude]),
  }


  const line1 = lineOffset(geojson, 5, { units: 'meters' }).geometry.coordinates
  const line2 = lineOffset(geojson, -5, { units: 'meters' }).geometry.coordinates.reverse()

  return {
    type: 'Polygon',
    coordinates: [[
      ...line1,
      ...line2,
      line1[0],
    ]],
  }
}
