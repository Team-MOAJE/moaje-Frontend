// module.register 훅: loader.mjs가 등록한다.
const STUBS = {
  'expo-secure-store': new URL('./stubs/expoSecureStore.mjs', import.meta.url).href,
  'react-native': new URL('./stubs/reactNative.mjs', import.meta.url).href,
  '@react-native-async-storage/async-storage': new URL('./stubs/asyncStorage.mjs', import.meta.url)
    .href,
};

const SRC_URL = new URL('../../src/', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (STUBS[specifier]) {
    return { url: STUBS[specifier], shortCircuit: true };
  }

  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');

  if (isRelative && context.parentURL?.startsWith(SRC_URL) && !/\.[cm]?js$/.test(specifier)) {
    return nextResolve(`${specifier}.js`, context);
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith(SRC_URL) && url.endsWith('.js')) {
    return nextLoad(url, { ...context, format: 'module' });
  }

  return nextLoad(url, context);
}
