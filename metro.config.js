// Metro с плагином Sentry: в бандл добавляются Debug ID, по которым Sentry сопоставляет стек ошибки с исходниками.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
