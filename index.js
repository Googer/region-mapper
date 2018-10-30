"use strict";

const ToGeoJSON = require('togeojson-with-extended-style'),
	fs = require('fs'),
	he = require('he'),
	turf = require('@turf/turf'),
	DOMParser = require('xmldom').DOMParser,

	map = require.resolve('PgP-Data/data/map.kml'),
	mapKml = new DOMParser().parseFromString(fs.readFileSync(map, 'utf8')),
	rawMapRegions = ToGeoJSON.kml(mapKml).features
		.filter(feature => feature.geometry.type === 'Polygon'),

	gymMetadata = require('PgP-Data/data/gyms-metadata'),

	regionMap = Object.create(null);

// flip order of coordinates so they're in the right order according to what turf expects
rawMapRegions
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

	gyms = require('PgP-Data/data/gyms')
		.map(gym => Object.create({
			id: gym.gymId,
			gym: Object.assign({}, gym, gymMetadata[gym.gymId]),
			point: turf.point([gym.gymInfo.longitude, gym.gymInfo.latitude])
		}));

let gymsList = 'Gym Name\tLongitude\tLatitude\n',
	exTagsList = 'Gym Name\tLongitude\tLatitude\n',
	confirmedExList = 'Gym Name\tLongitude\tLatitude\n';

gyms.forEach(gym => {
	const matchingRegions = mapRegions
			.filter(region => turf.inside(gym.point, region.geometry)),
		taggedEx = gym.gym.hasExTag,
		hostedEx = gym.gym.hasHostedEx;

	let regionGyms;
	matchingRegions.forEach(matchingRegion => {
		regionGyms = regionMap[matchingRegion.name];

		if (!regionGyms) {
			regionGyms = [];
			regionMap[matchingRegion.name] = regionGyms;
		}

		regionGyms.push(gym.id);
	});

	if (hostedEx && matchingRegions.length > 0) {
		confirmedExList += `${he.decode(gym.gym.gymName.trim()).replace(/"/g, '\'')}\t${gym.gym.gymInfo.longitude}\t${gym.gym.gymInfo.latitude}\n`;
	}

	if (taggedEx && matchingRegions.length > 0) {
		if (!hostedEx) {
			exTagsList += `${he.decode(gym.gym.gymName.trim()).replace(/"/g, '\'')}\t${gym.gym.gymInfo.longitude}\t${gym.gym.gymInfo.latitude}\n`;
		}
	}

	if (!hostedEx && !taggedEx && matchingRegions.length > 0) {
		gymsList += `${he.decode(gym.gym.gymName.trim()).replace(/"/g, '\'')}\t${gym.gym.gymInfo.longitude}\t${gym.gym.gymInfo.latitude}\n`;
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

fs.writeFileSync('standard-gyms.tsv', gymsList);
fs.writeFileSync('tagged-gyms.tsv', exTagsList);
fs.writeFileSync('ex-gyms.tsv', confirmedExList);

let mapCounts = '';

Object.entries(regionMap)
	.sort((entryA, entryB) => entryB[1].length - entryA[1].length)
	.forEach(([region, gyms]) => {
		mapCounts += `**${region}**: ${gyms.length}\n`;
	});

fs.writeFileSync('gym-counts.txt', mapCounts);