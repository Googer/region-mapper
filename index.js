"use strict";

const ToGeoJSON = require('togeojson-with-extended-style'),
	fs = require('fs'),
	turfHelpers = require('@turf/helpers'),
	turfInside = require('@turf/inside'),
	turfIntersect = require('@turf/intersect'),
	turfScale = require('@turf/transform-scale'),
	DOMParser = require('xmldom').DOMParser,
	kml = new DOMParser().parseFromString(fs.readFileSync('map.kml', 'utf8')),
	rawRegions = ToGeoJSON.kml(kml).features
		.filter(feature => feature.geometry.type === 'Polygon'),
	regionMap = Object.create(null);

// flip order of coordinates so they're in the right order according to what D3 expects
rawRegions.forEach(region => {
	region.geometry.coordinates[0].reverse();
//  region.geometry = turfScale(region.geometry, 1.1);
});

const mapRegions = rawRegions
		.map(region => [region.properties.name.replace(/#/, ''), region.geometry]),
	gyms = require('./gyms')
		.map(gym => [gym.gymId, turfHelpers.point([gym.gymInfo.longitude, gym.gymInfo.latitude])]);

gyms.forEach(gym => {
	const matchingRegions = mapRegions.filter(region => turfInside(gym[1], region[1]));

	let regionGyms;
	matchingRegions.forEach(matchingRegion => {
		regionGyms = regionMap[matchingRegion[0]];

		if (!regionGyms) {
			regionGyms = [];
			regionMap[matchingRegion[0]] = regionGyms;
		}

		regionGyms.push(gym[0]);
	});
});

const regionGraph = Object.create(null);

mapRegions.forEach(region => {
	regionGraph[region[0]] = mapRegions
		.filter(otherRegion => otherRegion[0] !== region[0])
		.filter(otherRegion => turfIntersect(region[1], otherRegion[1]) !== null)
		.map(otherRegion => otherRegion[0]);
});

fs.writeFileSync('region-map.json', JSON.stringify(regionMap, null, 2));
fs.writeFileSync('region-graph.json', JSON.stringify(regionGraph, null, 2));
