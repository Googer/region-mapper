"use strict";

const ToGeoJSON = require('togeojson-with-extended-style'),
	fs = require('fs'),
	turf = require('@turf/turf'),
	DOMParser = require('xmldom').DOMParser,

	map = require.resolve('PgP-Data/data/map.kml'),
	mapKml = new DOMParser().parseFromString(fs.readFileSync(map, 'utf8')),
	rawMapRegions = ToGeoJSON.kml(mapKml).features
		.filter(feature => feature.geometry.type === 'Polygon'),

	parks = require.resolve('PgP-data/data/parks.kml'),
	parksKml = new DOMParser().parseFromString(fs.readFileSync(parks, 'utf8')),
	rawParkRegions = ToGeoJSON.kml(parksKml).features
		.filter(feature => feature.geometry.type === 'Polygon'),

	regionMap = Object.create(null),
	parkGyms = [];

// flip order of coordinates so they're in the right order according to what turf expects
rawMapRegions
	.forEach(region => region.geometry.coordinates
		.forEach(coords => coords.reverse())
	);

rawParkRegions
	.forEach(region => region.geometry.coordinates
		.forEach(coords => coords.reverse())
	);

const mapRegions = rawMapRegions
		.map(region => Object.create({
			name: region.properties.name ?
				region.properties.name.replace(/#/, '') :
				'Unnamed Region',
			geometry: region.geometry
		})),
	parkRegions = rawParkRegions
		.map(region => region.geometry),

	gyms = require('PgP-Data/data/gyms')
		.map(gym => Object.create({
			id: gym.gymId,
			gym: gym,
			point: turf.point([gym.gymInfo.longitude, gym.gymInfo.latitude])
		}));

gyms.forEach(gym => {
	const matchingRegions = mapRegions
			.filter(region => turf.inside(gym.point, region.geometry)),
		inPark = parkRegions
			.some(region => turf.inside(gym.point, region));

	let regionGyms;
	matchingRegions.forEach(matchingRegion => {
		regionGyms = regionMap[matchingRegion.name];

		if (!regionGyms) {
			regionGyms = [];
			regionMap[matchingRegion.name] = regionGyms;
		}

		regionGyms.push(gym.id);
	});

	if (inPark) {
		parkGyms.push(gym.id);
	}
});

const regionGraph = Object.create(null);

mapRegions.forEach(region => {
	regionGraph[region.name] = mapRegions
		.filter(otherRegion => otherRegion.name !== region.name)
		.filter(otherRegion => turf.intersect(region.geometry, otherRegion.geometry) !== null)
		.map(otherRegion => otherRegion.name);
});

fs.writeFileSync('region-map.json', JSON.stringify(regionMap, null, 2));
fs.writeFileSync('region-graph.json', JSON.stringify(regionGraph, null, 2));
fs.writeFileSync('park-gyms.json', JSON.stringify(parkGyms, null, 2));
