export default waypoints => ({
  type: 'LineString' ,
  coordinates: waypoints.map(waypoint => [waypoint.position.longitude, waypoint.position.latitude]),
})
