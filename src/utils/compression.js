// ============================================================
// データ圧縮ユーティリティ - compression.js
// LZ-based compression for localStorage
// ============================================================

/**
 * LZ-based string compression (simplified LZ-string implementation)
 * Compresses JSON strings to reduce localStorage usage
 */

const keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

function compressToBase64(input) {
  if (input == null) return "";
  let result = "";
  let current = 0;
  let position = 0;
  let bits = 6;

  const context_dictionary = {};
  let context_dictionaryToCreate = {};
  let context_c = "";
  let context_wc = "";
  let context_w = "";
  let context_enlargeIn = 2;
  let context_dictSize = 3;
  let context_numBits = 2;
  let context_data = [];
  let context_data_val = 0;
  let context_data_position = 0;

  for (let ii = 0; ii < input.length; ii++) {
    context_c = input.charAt(ii);
    if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
      context_dictionary[context_c] = context_dictSize++;
      context_dictionaryToCreate[context_c] = true;
    }

    context_wc = context_w + context_c;
    if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) {
      context_w = context_wc;
    } else {
      if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
        if (context_w.charCodeAt(0) < 256) {
          for (let i = 0; i < context_numBits; i++) {
            context_data_val = (context_data_val << 1);
            if (context_data_position === bits - 1) {
              context_data_position = 0;
              context_data.push(keyStrBase64.charAt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
          }
          let value = context_w.charCodeAt(0);
          for (let i = 0; i < 8; i++) {
            context_data_val = (context_data_val << 1) | (value & 1);
            if (context_data_position === bits - 1) {
              context_data_position = 0;
              context_data.push(keyStrBase64.charAt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
        } else {
          let value = 1;
          for (let i = 0; i < context_numBits; i++) {
            context_data_val = (context_data_val << 1) | value;
            if (context_data_position === bits - 1) {
              context_data_position = 0;
              context_data.push(keyStrBase64.charAt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = 0;
          }
          value = context_w.charCodeAt(0);
          for (let i = 0; i < 16; i++) {
            context_data_val = (context_data_val << 1) | (value & 1);
            if (context_data_position === bits - 1) {
              context_data_position = 0;
              context_data.push(keyStrBase64.charAt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
        }
        context_enlargeIn--;
        if (context_enlargeIn === 0) {
          context_enlargeIn = Math.pow(2, context_numBits);
          context_numBits++;
        }
        delete context_dictionaryToCreate[context_w];
      } else {
        let value = context_dictionary[context_w];
        for (let i = 0; i < context_numBits; i++) {
          context_data_val = (context_data_val << 1) | (value & 1);
          if (context_data_position === bits - 1) {
            context_data_position = 0;
            context_data.push(keyStrBase64.charAt(context_data_val));
            context_data_val = 0;
          } else {
            context_data_position++;
          }
          value = value >> 1;
        }
      }
      context_enlargeIn--;
      if (context_enlargeIn === 0) {
        context_enlargeIn = Math.pow(2, context_numBits);
        context_numBits++;
      }
      context_dictionary[context_wc] = context_dictSize++;
      context_w = String(context_c);
    }
  }

  if (context_w !== "") {
    if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
      if (context_w.charCodeAt(0) < 256) {
        for (let i = 0; i < context_numBits; i++) {
          context_data_val = (context_data_val << 1);
          if (context_data_position === bits - 1) {
            context_data_position = 0;
            context_data.push(keyStrBase64.charAt(context_data_val));
            context_data_val = 0;
          } else {
            context_data_position++;
          }
        }
        let value = context_w.charCodeAt(0);
        for (let i = 0; i < 8; i++) {
          context_data_val = (context_data_val << 1) | (value & 1);
          if (context_data_position === bits - 1) {
            context_data_position = 0;
            context_data.push(keyStrBase64.charAt(context_data_val));
            context_data_val = 0;
          } else {
            context_data_position++;
          }
          value = value >> 1;
        }
      } else {
        let value = 1;
        for (let i = 0; i < context_numBits; i++) {
          context_data_val = (context_data_val << 1) | value;
          if (context_data_position === bits - 1) {
            context_data_position = 0;
            context_data.push(keyStrBase64.charAt(context_data_val));
            context_data_val = 0;
          } else {
            context_data_position++;
          }
          value = 0;
        }
        value = context_w.charCodeAt(0);
        for (let i = 0; i < 16; i++) {
          context_data_val = (context_data_val << 1) | (value & 1);
          if (context_data_position === bits - 1) {
            context_data_position = 0;
            context_data.push(keyStrBase64.charAt(context_data_val));
            context_data_val = 0;
          } else {
            context_data_position++;
          }
          value = value >> 1;
        }
      }
      context_enlargeIn--;
      if (context_enlargeIn === 0) {
        context_enlargeIn = Math.pow(2, context_numBits);
        context_numBits++;
      }
      delete context_dictionaryToCreate[context_w];
    } else {
      let value = context_dictionary[context_w];
      for (let i = 0; i < context_numBits; i++) {
        context_data_val = (context_data_val << 1) | (value & 1);
        if (context_data_position === bits - 1) {
          context_data_position = 0;
          context_data.push(keyStrBase64.charAt(context_data_val));
          context_data_val = 0;
        } else {
          context_data_position++;
        }
        value = value >> 1;
      }
    }
    context_enlargeIn--;
    if (context_enlargeIn === 0) {
      context_enlargeIn = Math.pow(2, context_numBits);
      context_numBits++;
    }
  }

  // Mark the end of the stream
  let value = 2;
  for (let i = 0; i < context_numBits; i++) {
    context_data_val = (context_data_val << 1) | (value & 1);
    if (context_data_position === bits - 1) {
      context_data_position = 0;
      context_data.push(keyStrBase64.charAt(context_data_val));
      context_data_val = 0;
    } else {
      context_data_position++;
    }
    value = value >> 1;
  }

  // Flush the last char
  while (true) {
    context_data_val = (context_data_val << 1);
    if (context_data_position === bits - 1) {
      context_data.push(keyStrBase64.charAt(context_data_val));
      break;
    } else {
      context_data_position++;
    }
  }

  return context_data.join('');
}

function decompressFromBase64(input) {
  if (input == null) return "";
  if (input === "") return null;

  const getBaseValue = (alphabet, character) => {
    return alphabet.indexOf(character);
  };

  let length = input.length;
  const resetValue = 32;
  const bits = 6;
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;
  let entry = "";
  let result = [];
  let w;
  let c;
  let resb;
  const dictionary = { 0: 0, 1: 1, 2: 2 };

  const data = { val: getBaseValue(keyStrBase64, input.charAt(0)), position: resetValue, index: 1 };

  for (let i = 0; i < 3; i++) {
    dictionary[i] = i;
  }

  let bits_val = 0;
  let maxpower = Math.pow(2, 2);
  let power = 1;
  while (power !== maxpower) {
    resb = data.val & data.position;
    data.position >>= 1;
    if (data.position === 0) {
      data.position = resetValue;
      data.val = getBaseValue(keyStrBase64, input.charAt(data.index++));
    }
    bits_val |= (resb > 0 ? 1 : 0) * power;
    power <<= 1;
  }

  const next = bits_val;
  switch (next) {
    case 0:
      bits_val = 0;
      maxpower = Math.pow(2, 8);
      power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.val = getBaseValue(keyStrBase64, input.charAt(data.index++));
        }
        bits_val |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      c = String.fromCharCode(bits_val);
      break;
    case 1:
      bits_val = 0;
      maxpower = Math.pow(2, 16);
      power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.val = getBaseValue(keyStrBase64, input.charAt(data.index++));
        }
        bits_val |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      c = String.fromCharCode(bits_val);
      break;
    case 2:
      return "";
  }

  dictionary[3] = c;
  w = c;
  result.push(c);

  while (true) {
    if (data.index > length) {
      return "";
    }

    bits_val = 0;
    maxpower = Math.pow(2, numBits);
    power = 1;
    while (power !== maxpower) {
      resb = data.val & data.position;
      data.position >>= 1;
      if (data.position === 0) {
        data.position = resetValue;
        data.val = getBaseValue(keyStrBase64, input.charAt(data.index++));
      }
      bits_val |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }

    c = bits_val;
    switch (c) {
      case 0:
        bits_val = 0;
        maxpower = Math.pow(2, 8);
        power = 1;
        while (power !== maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position === 0) {
            data.position = resetValue;
            data.val = getBaseValue(keyStrBase64, input.charAt(data.index++));
          }
          bits_val |= (resb > 0 ? 1 : 0) * power;
          power <<= 1;
        }
        dictionary[dictSize++] = String.fromCharCode(bits_val);
        c = dictSize - 1;
        enlargeIn--;
        break;
      case 1:
        bits_val = 0;
        maxpower = Math.pow(2, 16);
        power = 1;
        while (power !== maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position === 0) {
            data.position = resetValue;
            data.val = getBaseValue(keyStrBase64, input.charAt(data.index++));
          }
          bits_val |= (resb > 0 ? 1 : 0) * power;
          power <<= 1;
        }
        dictionary[dictSize++] = String.fromCharCode(bits_val);
        c = dictSize - 1;
        enlargeIn--;
        break;
      case 2:
        return result.join('');
    }

    if (enlargeIn === 0) {
      enlargeIn = Math.pow(2, numBits);
      numBits++;
    }

    if (dictionary[c]) {
      entry = dictionary[c];
    } else {
      if (c === dictSize) {
        entry = w + w.charAt(0);
      } else {
        return null;
      }
    }
    result.push(entry);

    dictionary[dictSize++] = w + entry.charAt(0);
    enlargeIn--;

    if (enlargeIn === 0) {
      enlargeIn = Math.pow(2, numBits);
      numBits++;
    }

    w = entry;
  }
}

/**
 * Compress JSON data for localStorage
 * @param {Object} data - Data to compress
 * @returns {string} Compressed string
 */
export function compressData(data) {
  const jsonStr = JSON.stringify(data);
  return 'LZ:' + compressToBase64(jsonStr);
}

/**
 * Decompress data from localStorage
 * @param {string} compressed - Compressed string
 * @returns {Object|null} Decompressed data or null if failed
 */
export function decompressData(compressed) {
  if (!compressed) return null;

  // Check if data is compressed (has LZ: prefix)
  if (compressed.startsWith('LZ:')) {
    const decompressed = decompressFromBase64(compressed.slice(3));
    if (decompressed) {
      return JSON.parse(decompressed);
    }
    return null;
  }

  // Not compressed, try to parse as JSON directly (for old save data)
  try {
    return JSON.parse(compressed);
  } catch (e) {
    return null;
  }
}

/**
 * Calculate estimated storage size
 * @param {string} str - String to measure
 * @returns {number} Size in bytes
 */
export function getStorageSize(str) {
  return new Blob([str]).size;
}

/**
 * Get total localStorage usage
 * @returns {Object} { used: bytes, total: bytes, percentage: number }
 */
export function getLocalStorageUsage() {
  let total = 0;
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += localStorage[key].length * 2; // UTF-16 encoding
    }
  }
  const maxSize = 5 * 1024 * 1024; // 5MB typical limit
  return {
    used: total,
    total: maxSize,
    percentage: (total / maxSize * 100).toFixed(1)
  };
}
