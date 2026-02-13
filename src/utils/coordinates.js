/**
 * Coordinate Extraction Utility
 * Extracts latitude & longitude from PostGIS location field
 * 
 * Supported formats:
 * - EWKB binary hex string format: "0101000020E61000004C2622F38AD75740594F9CF8B9461640"
 * - WKT format: "POINT(95.367856 5.569069)"
 * - GeoJSON format: {type: "Point", coordinates: [lng, lat]}
 */

/**
 * Extract coordinates from various location formats
 * @param {string|object} location - PostGIS location field
 * @returns {{longitude: number, latitude: number}|null} Coordinates or null if parsing fails
 */
export const extractCoordinatesFromLocation = (location) => {
  if (!location) return null;

  try {
    // Format 1: WKT "POINT(longitude latitude)"
    if (typeof location === 'string') {
      // Try WKT format first
      const wktMatch = location.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
      if (wktMatch) {
        const result = {
          longitude: parseFloat(wktMatch[1]),
          latitude: parseFloat(wktMatch[2])
        };
        console.log(`✅ WKT parsed: lon=${result.longitude}, lat=${result.latitude}`);
        return result;
      }

      // Try EWKB hex format (any valid hex string with length 40+)
      // EWKB is: 1 byte endian + 4 bytes geometry type + 8 bytes SRID (optional) + 8 bytes lon + 8 bytes lat
      if (/^[0-9a-f]+$/i.test(location) && location.length >= 40) {
        console.log(`🔄 EWKB hex detected, length: ${location.length}`);
        try {
          const buffer = Buffer.from(location, 'hex');
          console.log(`📦 Buffer created, length: ${buffer.length} bytes`);
          
          const endian = buffer[0]; // 0 = big, 1 = little
          const littleEndian = endian === 1;
          console.log(`🔀 Endian: ${littleEndian ? 'little' : 'big'}`);
          
          // Coordinates start at byte 9 (after SRID and geometry type)
          // Each coordinate is 8 bytes (double precision)
          if (buffer.length >= 25) {
            const longitude = buffer.readDoubleLE(9);
            const latitude = buffer.readDoubleLE(17);
            console.log(`✅ EWKB parsed: lon=${longitude}, lat=${latitude}`);
            return {
              longitude,
              latitude
            };
          } else {
            console.warn(`⚠️ Buffer too short: ${buffer.length} bytes, need 25+`);
          }
        } catch (bufferError) {
          console.error(`❌ Failed to parse EWKB buffer:`, bufferError.message);
        }
      }
    }

    // Format 2: GeoJSON {type: "Point", coordinates: [lng, lat]}
    if (typeof location === 'object' && location.type === 'Point' && Array.isArray(location.coordinates)) {
      const result = {
        longitude: location.coordinates[0],
        latitude: location.coordinates[1]
      };
      console.log(`✅ GeoJSON parsed: lon=${result.longitude}, lat=${result.latitude}`);
      return result;
    }

    console.warn(`⚠️ Location format not recognized: ${typeof location === 'string' ? location.substring(0, 50) : JSON.stringify(location)}`);
  } catch (e) {
    console.error('❌ Error extracting coordinates from location:', e.message);
  }

  return null;
};

export default {
  extractCoordinatesFromLocation
};
