## arcgis-copy-assets
Copies assets from @arcgis/core to the public folder

### Install
```
yarn add arcgis-copy-assets

or

npm install -s arcgis-copy-assets
```

### Use (example)
```
// package.json

"scripts": {
  "copy:assets": "arcgis-copy-assets -v -C --p pnpm -c arcgis.config.json",
}
```

```
// in your app component
import esriConfig from '@arcgis/core/config';
import { setAssetPath } from '@esri/calcite-components/dist/components';

esriConfig.assetsPath = './arcgis';
setAssetPath('./calcite');
```

```
// .gitignore

# arcgis assets
/public/arcgis
/public/calcite
```

### Options (Supersede configurations)
```
-v | --verbose          Enable verbose logging
-C | --calcite          Includes calcite assets in output
-p | --package-manager  Denotes which package manager is being used (options: npm | pnpm)
-c | --config           Relative path to configuration file
```

### Config (JSON)
```
// arcgis.config.json

{
  "calcite": true,
  "packageManager": "pnpm",
  "publicDirectory": "./public",
  "packageJsonPath": "./package.json",
  "cacheDirectory": "../../.yarn/cache"
}
```

### Config (JavaScript)
```
// arcgis.config.{js|mjs}

const config = {
  calcite: true,
  packageManager: 'pnpm',
  publicDirectory: './public',
  packageJsonPath: './package.json',
  cacheDirectory: '../../.yarn/cache',
};

export default config;
```

