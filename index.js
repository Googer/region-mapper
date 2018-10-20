"use strict";

const ToGeoJSON = require('togeojson-with-extended-style'),
	fs = require('fs'),
	he = require('he'),
	S2 = require('s2-geometry').S2,
	turf = require('@turf/turf'),
	DOMParser = require('xmldom').DOMParser,

	map = require.resolve('PgP-Data/data/map.kml'),
	mapKml = new DOMParser().parseFromString(fs.readFileSync(map, 'utf8')),
	rawMapRegions = ToGeoJSON.kml(mapKml).features
		.filter(feature => feature.geometry.type === 'Polygon'),

	parks = require.resolve('PgP-Data/data/parks.kml'),
	parksKml = new DOMParser().parseFromString(fs.readFileSync(parks, 'utf8')),
	rawParkRegions = ToGeoJSON.kml(parksKml).features
		.filter(feature => feature.geometry.type === 'Polygon'),

	gymMetadata = require('PgP-Data/data/gyms-metadata'),
	regionMap = Object.create(null),
	parkGyms = [];

let blockingRegions;

try {
	const blockingFeatures = require.resolve('PgP-data/data/blocking-features.kml'),
		blockingFeaturessKml = new DOMParser().parseFromString(fs.readFileSync(blockingFeatures, 'utf8')),
		rawBlockingFeatureRegions = ToGeoJSON.kml(blockingFeaturessKml).features
			.filter(feature => feature.geometry.type === 'Polygon');

	rawBlockingFeatureRegions
		.forEach(region => region.geometry.coordinates
			.forEach(coords => coords.reverse())
		);

	blockingRegions = rawBlockingFeatureRegions
		.map(region => region.geometry);
} catch (err) {
	blockingRegions = [];
}


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
			gym: Object.assign({}, gym, gymMetadata[gym.gymId]),
			point: turf.point([gym.gymInfo.longitude, gym.gymInfo.latitude])
		}));

let gymsList = 'Gym Name\tLongitude\tLatitude\n',
	parksList = 'Gym Name\tLongitude\tLatitude\n',
	exList = 'Gym Name\tLongitude\tLatitude\n',
	outsideList = 'Gym Name\tLongitude\tLatitude\n';

gyms.forEach(gym => {
	const matchingRegions = mapRegions
			.filter(region => turf.inside(gym.point, region.geometry)),
		s2Cell = S2.S2Cell.FromLatLng({lat: gym.point.geometry.coordinates[1], lng: gym.point.geometry.coordinates[0]}, 20),
		s2Center = s2Cell.getLatLng(),
		s2CenterPoint = turf.point([s2Center.lng, s2Center.lat]),
		inPark = parkRegions
			.some(region => turf.inside(s2CenterPoint, region)),
		inBlocking = blockingRegions
			.some(region => turf.inside(s2CenterPoint, region)),
		hostedEx = gym.gym.is_ex;

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
		exList += `${he.decode(gym.gym.gymName.trim()).replace(/"/g, '\'')}\t${gym.gym.gymInfo.longitude}\t${gym.gym.gymInfo.latitude}\n`;
	}

	if (inPark && !inBlocking && matchingRegions.length > 0) {
		parkGyms.push(gym.id);

		if (!hostedEx) {
			parksList += `${he.decode(gym.gym.gymName.trim()).replace(/"/g, '\'')}\t${gym.gym.gymInfo.longitude}\t${gym.gym.gymInfo.latitude}\n`;
		}
	}

	if (!hostedEx && (!inPark || inBlocking)  && matchingRegions.length > 0) {
		gymsList += `${he.decode(gym.gym.gymName.trim()).replace(/"/g, '\'')}\t${gym.gym.gymInfo.longitude}\t${gym.gym.gymInfo.latitude}\n`;
	}

	if (matchingRegions.length === 0) {
		outsideList += `${he.decode(gym.gym.gymName.trim()).replace(/"/g, '\'')}\t${gym.gym.gymInfo.longitude}\t${gym.gym.gymInfo.latitude}\n`;
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

fs.writeFileSync('standard-gyms.tsv', gymsList);
fs.writeFileSync('park-gyms.tsv', parksList);
fs.writeFileSync('ex-gyms.tsv', exList);
fs.writeFileSync('outside-gyms.tsv', outsideList);
