#!/usr/bin/env node

/* eslint-disable import/no-named-as-default */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { createLogger, format, transports } from 'winston';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

let glob;
const importedGlob = await import('glob');
glob = importedGlob.default || importedGlob;

const argv = yargs(hideBin(process.argv))
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose logging',
  })
  .option('calcite', {
    alias: 'C',
    type: 'boolean',
    description: 'Include calcite assets',
  })
  .option('config', {
    alias: 'c',
    type: 'string',
    description: 'Path to configuration file',
    requiresArg: true,
  })
  .option('package-manager', {
    alias: 'p',
    type: 'string',
    description: 'Specify package manager to use',
    choices: ['npm', 'yarn', 'pnpm'],
    default: 'npm',
    requiresArg: true,
  }).argv;

const loggingLevel = argv.verbose ? 'verbose' : 'info';

const { combine, timestamp: timestampf, label: labelf, printf, colorize } = format;

const loggerFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

const logger = createLogger({
  level: loggingLevel,
  defaultMeta: { service: 'arcgis-next-copy-assets' },
  format: combine(labelf({ label: 'arcgis-next-copy-assets' }), colorize(), timestampf(), loggerFormat),
  transports: [new transports.Console()],
});

logger.debug(`Argv: ${JSON.stringify(argv, null, 2)}`);

const mkDirIfNotExists = dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  } else {
    logger.verbose(`Directory ${dir} already exists.`);
  }
};

const copyDirectoryRecursive = (source, destination) => {
  mkDirIfNotExists(destination);
  const files = fs.readdirSync(source);
  files.forEach(file => {
    const sourceFilePath = path.join(source, file);
    const destinationFilePath = path.join(destination, file);
    if (fs.statSync(sourceFilePath).isDirectory()) {
      copyDirectoryRecursive(sourceFilePath, destinationFilePath);
    } else {
      fs.copyFileSync(sourceFilePath, destinationFilePath);
    }
  });
};

const deleteDirectoryRecursive = directory => {
  if (fs.existsSync(directory)) {
    const files = fs.readdirSync(directory);
    files.forEach(file => {
      const filePath = path.join(directory, file);
      if (fs.statSync(filePath).isDirectory()) {
        deleteDirectoryRecursive(filePath);
      } else {
        fs.unlinkSync(filePath);
      }
    });
    fs.rmdirSync(directory);
  }
};

const checkDependencyExists = (packageJson, dependency) => {
  const dependencies = packageJson && packageJson.dependencies ? packageJson.dependencies : {};
  const peerDependencies = packageJson && packageJson.peerDependencies ? packageJson.peerDependencies : {};
  if (dependency in dependencies || dependency in peerDependencies) {
    logger.verbose(`Found dependency ${dependency} in package.json`);
  } else {
    logger.error(`Dependency ${dependency} not found in in package.json`);
    process.exit(1);
  }
};

const extractZippedDependency = (cache, zipPattern, targetDirectory) => {
  logger.verbose(`Searching for zip file with pattern ${zipPattern} in ${cache}...`);
  const zipFiles = glob.sync(zipPattern, { cwd: cache }); // find zip file in cache directory
  logger.verbose(`Found ${zipFiles.length} zip files.\n${JSON.stringify(zipFiles, null, 2)}`);

  let zipFile = undefined;
  if (zipFiles.length === 0) {
    // handle case where no zip file is found
    logger.error(`No zip file found for: ${zipPattern}`);
    process.exit(1);
  } else {
    // grab last zip file
    zipFile = zipFiles[zipFiles.length - 1];
    logger.verbose(`Found zip file: ${zipFile}`);
  }

  const zipFilePath = path.join('../../.yarn/cache', zipFile);

  const zip = new AdmZip(zipFilePath);
  zip.extractAllTo(targetDirectory, true);
  logger.verbose("Extracted asset's zip file successfully.");
};

const main = config => {
  logger.info('Starting arcgis-next-copy-assets...');
  logger.debug(`(Main) Configuration: ${JSON.stringify(config, null, 2)}`);

  const cwd = process.cwd();
  logger.verbose(`Current working directory: ${cwd}`);

  const isPnpm = config.packageManager === 'pnpm';
  const includeCalcite = config.calcite ? config.calcite : false;

  const publicDirectory =
    config && config.publicDirectory ? path.join(cwd, config.publicDirectory) : path.join(cwd, 'public'); // public directory to copy assets to
  const targetDirectory = path.join(publicDirectory, 'unzipped-dependency'); // temp directory to unzip the dependency to

  logger.verbose(`Creating working directory: ${targetDirectory}`);
  mkDirIfNotExists(targetDirectory);

  const packageJsonPath =
    config && config.packageJsonPath ? path.join(cwd, config.packageJsonPath) : path.join(cwd, 'package.json');
  const packageJsonContents = fs.readFileSync(packageJsonPath, 'utf-8');

  logger.verbose(`Reading package.json file at ${packageJsonPath}...`);
  const packageJson = JSON.parse(packageJsonContents);

  const baseAssetsDirectory = isPnpm ? path.join(targetDirectory) : path.join(cwd);
  const arcgisAssetsDirectory = path.join(baseAssetsDirectory, 'node_modules/@arcgis/core/assets');
  const calciteAssetsDirectory = path.join(
    baseAssetsDirectory,
    'node_modules/@esri/calcite-components/dist/calcite/assets',
  );

  const packages = [
    {
      name: '@arcgis/core',
      pattern: '@arcgis-core-*.zip',
      assetsDirectory: arcgisAssetsDirectory,
      outputDirectory: path.join(publicDirectory, 'arcgis'),
    },
  ];
  if (includeCalcite) {
    packages.push({
      name: '@esri/calcite-components',
      pattern: '@esri-calcite-components-*.zip',
      assetsDirectory: calciteAssetsDirectory,
      outputDirectory: path.join(publicDirectory, 'calcite'),
    });
  }

  packages.forEach(({ name, outputDirectory }) => {
    checkDependencyExists(packageJson, name);
    logger.verbose(`Deleting existing assets directory: ${outputDirectory}`);
    deleteDirectoryRecursive(outputDirectory);
    logger.verbose(`Creating assets directory: ${outputDirectory}`);
    mkDirIfNotExists(outputDirectory);
  });

  if (isPnpm) {
    logger.verbose('Extracting assets from pnpm cache directory to working directory...');
    const cacheDirectory =
      config && config.cacheDirectory ? path.join(cwd, config.cacheDirectory) : path.join(cwd, '../..', '.yarn/cache'); // cache directory in a pnpm/yarn workspace

    packages.forEach(({ name, pattern }) => {
      logger.verbose(`Extracting ${name} zip file...`);
      extractZippedDependency(cacheDirectory, pattern, targetDirectory);
    });
  }

  packages.forEach(({ assetsDirectory, outputDirectory }) => {
    if (fs.existsSync(assetsDirectory)) {
      logger.verbose(`Copying assets from ${assetsDirectory} to ${outputDirectory}`);
      copyDirectoryRecursive(assetsDirectory, outputDirectory);
    } else {
      logger.error(`Could not find assets directory: ${assetsDirectory}`);
      process.exit(1);
    }
  });

  logger.verbose(`Deleting temporary working directory: ${targetDirectory}`);
  deleteDirectoryRecursive(targetDirectory);

  logger.info('Completed copying @argis/core assets to nextjs public directory');
};

const parseConfig = async configPath => {
  let config = {};
  if (configPath) {
    const configFile = path.join(process.cwd(), configPath);
    if (fs.existsSync(configFile)) {
      logger.verbose(`Loading configuration from ${configFile}`);
      const extname = path.extname(configFile).toLowerCase();
      if (['.json'].includes(extname)) {
        const configContent = fs.readFileSync(configFile, 'utf8');
        config = JSON.parse(configContent);
      } else if (['.js', '.mjs'].includes(extname)) {
        try {
          const configModule = await import(configFile);
          config = configModule.default || configModule;
        } catch (err) {
          logger.error(`Error loading JavaScript/TypeScript module: ${err}`);
        }
      } else {
        logger.error(`Unsupported configuration file format: ${extname}`);
        process.exit(1);
      }
      logger.debug(`Configuration: ${JSON.stringify(config, null, 2)}`);
    } else {
      logger.warn(`Configuration file ${configFile} does not exist`);
    }
  } else {
    logger.warn(`No configuration file specified`);
  }
  return config;
};

const parsedConfig = await parseConfig(argv.config);

let packageManager;

if (argv['package-manager']) {
  packageManager = argv['package-manager'];
  logger.verbose(`Using package manager: ${packageManager}`);
}

const calcite = argv.calcite ? true : false;
logger.verbose(`Including calcite assets: ${calcite}`);

main({ ...parsedConfig, packageManager, calcite });
