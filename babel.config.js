module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // babel-preset-expo auto-configures Reanimated/Worklets plugin for SDK 58.
  };
};
