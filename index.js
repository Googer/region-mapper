"use strict";

const D3 = require('d3-geo'),
	ToGeoJSON = require('togeojson-with-extended-style'),
	fs = require('fs'),
	DOMParser = require('xmldom').DOMParser,
	kml = new DOMParser().parseFromString(fs.readFileSync('map.kml', 'utf8')),
	regions = ToGeoJSON.kml(kml).features,
	regionMap = Object.create(null);

regions.forEach(region => {
	region.geometry.coordinates[0].reverse();
});

const d3Regions = regions
		.map(feature => [feature.properties.name, feature.geometry]),
	gyms = require('./gyms')
		.map(gym => [gym.gymId, [gym.gymInfo.longitude, gym.gymInfo.latitude]]);


gyms.forEach(gym => {
	const matchingRegions = d3Regions.filter(region => D3.geoContains(region[1], gym[1]));

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

fs.writeFileSync('region-map.json', JSON.stringify(regionMap, null, 2));
