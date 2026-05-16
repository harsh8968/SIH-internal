const { getDefaultConfig: getExpoConfig } = require('expo/metro-config');
const { mergeConfig, getDefaultConfig: getRNConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const expoConfig = getExpoConfig(__dirname);
const rnConfig = getRNConfig(__dirname);

const config = {
  resolver: {
    // Exclude native folders and problematic deep directories from being watched
    blockList: [
      /android\/.*/,
      /ios\/.*/,
      /node_modules\/.*\/node_modules\/.*/,
      /node_modules\/expo-modules-core\/expo-module-gradle-plugin\/.*/,
    ],
  },
  transformer: {
    minifierConfig: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
      },
      mangle: {
        toplevel: true,
      },
      output: {
        comments: false,
      },
    },
    assetPlugins: ['expo-asset/tools/hashAssetFiles'],
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(rnConfig, expoConfig, config);

