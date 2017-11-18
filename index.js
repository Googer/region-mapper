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

// flip order of coordinates so they're in the right order according to what turf expects
rawRegions.forEach(region => {
	region.geometry.coordinates[0].reverse();
//  region.geometry = turfScale(region.geometry, 1.1);
});

const mapRegions = rawRegions
		.map(region => Object.create({
			name: region.properties.name.replace(/#/, ''),
			geometry: region.geometry
		})),
	gyms = require('PgP-Data/data/gyms')
		.map(gym => Object.create({
			id: gym.gymId,
			gym: gym,
			point: turfHelpers.point([gym.gymInfo.longitude, gym.gymInfo.latitude])
		}));

gyms.forEach(gym => {
	const matchingRegions = mapRegions.filter(region => turfInside(gym.point, region.geometry));

	let regionGyms;
	matchingRegions.forEach(matchingRegion => {
		regionGyms = regionMap[matchingRegion.name];

		if (!regionGyms) {
			regionGyms = [];
			regionMap[matchingRegion.name] = regionGyms;
		}

		regionGyms.push(gym.id);
	});
});

Object.entries(regionMap).forEach(([region, gymIds]) => {
	let tsv = 'Gym Name\tLatitude\tLongitude\n';

	tsv = tsv + gymIds.map(gymId => gyms.find(gym => gym.id === gymId))
		.map(gym => gym.gym)
		.sort((gymA, gymB) => gymA.gymName.localeCompare(gymB.gymName))
		.map(gym => `${gym.gymName.replace(/"/g, '\'')}\t${gym.gymInfo.latitude}\t${gym.gymInfo.longitude}`)
		.join('\n');

	fs.writeFileSync(`${region}.tsv`, tsv);
});

const regionGraph = Object.create(null);

mapRegions.forEach(region => {
	regionGraph[region.name] = mapRegions
		.filter(otherRegion => otherRegion.name !== region.name)
		.filter(otherRegion => turfIntersect(region.geometry, otherRegion.geometry) !== null)
		.map(otherRegion => otherRegion.name);
});

fs.writeFileSync('region-map.json', JSON.stringify(regionMap, null, 2));
fs.writeFileSync('region-graph.json', JSON.stringify(regionGraph, null, 2));
