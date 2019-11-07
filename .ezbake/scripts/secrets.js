const fs = require('fs-extra');
const path = require('path');
const child_process = require('child_process');
const {
  AuthInfo
} = require('@salesforce/core');
const os = require('os');
const colors = require('ansi-colors');
const config = require('@appirio/appirio/lib/config/config');

const cwd = path.resolve(process.cwd());
const pathToEnvFile = path.join(cwd, `.env`);
const pathToEzbake = path.join(cwd, `.ezbake`);
const pathToSecrets = path.join(cwd, `.ezbake`, `scripts`);
const pathToForceOrg = path.join(cwd, 'force-org');
const pathToDefaultDir = path.join(pathToForceOrg, 'default');
const targetRepo = 'https://github.com/Appirio/adx-travis-sfdx-unpackaged.git';
const failedCISecrets = {};

// Method to convert the multi-line values into a quoted and single line value
const formatValue = value => {
  if (!value || typeof value !== 'string') {
    value = '';
  }
  let finalValue = value;
  const test = '(\r\n|\n|\r)';
  const re = new RegExp(test, 'gm');
  const match = value.match(re);
  if (match) {
    finalValue = '"' + value.replace(re, '\\n') + '"';
  }
  return finalValue;
};

//Method to write .env file
function createEnvFile(secrets) {
  let contents = Object.keys(secrets)
    .sort()
    .map(secretName => {
      secrets[secretName] = formatValue(secrets[secretName]);
      return `${secretName} = ${secrets[secretName]}` + os.EOL;
    })
    .reduce((previous, current) => {
      return previous.concat(current);
    }, '');

  fs.writeFileSync(pathToEnvFile, contents, {
    encoding: 'utf8'
  });
  console.log(`. Wrote ${pathToEnvFile} successfully`);
}

const writeCiConfig = ({
  envFile,
  key,
  body
}) => {
  return new Promise((resolve, reject) => {
    let ciSecretParameters;
    if (envFile) {
      ciSecretParameters = ['--file', `"${envFile}"`];
      console.log(`. Writing secrets from file ${envFile} to CI`);
    }
    if (key) {
      if (body) {
        ciSecretParameters = ['--key', `"${key}"`, '--body', `"${body}"`];
      }
      console.log(`. Writing secret ${key} to CI`);
    }
    if (targetRepo) {
      try {
        const cp = child_process.spawn('adx', ['ci:secret', ...ciSecretParameters], {
          shell: true,
          stdio: 'inherit'
        });
        cp.on("close", (code) => {
          if (code !== 0) {
            if (key) {
              failedCISecrets[key] = body || '';
              console.log(`. ${colors.yellow(`Failed to write secret ${key} to CI`)}`);
            } else {
              console.log(`. ${colors.yellow(`Failed to write secrets from file ${envFile} to CI`)}`);
            }
          }
          resolve();
        });
        cp.on("error", resolve);
      } catch (e) {
        if (key) {
          failedCISecrets[key] = body || '';
          console.log(`. ${colors.yellow(`Failed to write secret ${key} to CI`)}`);
        } else {
          console.log(`. ${colors.yellow(`Failed to write secrets from file ${envFile} to CI`)}`);
        }
        resolve();
      }
    } else {
      resolve();
    }
  })
};

const getAuthURL = async (username) => {
  const authInfoObj = await AuthInfo.create({ username });
  const authURL = authInfoObj.getSfdxAuthUrl().replace(/(?<=force:\/\/.+)(:undefined:)(?=.+)/g, '::');
  return authURL;
};

let warningMessages = [];
if(false) {
  if (!config.hasSecret('sonarqube.access_token')) {
    warningMessages.push(`Sonarqube Access Token not found.
  Sonar jobs will fail if you've chosen to use Sonarqube.
  After generating it, store it in SONAR_LOGIN secret variable on GitLab for any existing projects.`);
  }

  if (!config.hasSecret('gitlab.personal_token')) {
    warningMessages.push(`GitLab Access Token not found.
  Unable to push your project to GitLab unless it's set.`);
  }

  if (!config.hasUserConfig('gitlab.username')) {
    warningMessages.push(`GitLab Username not found.
  Validations/deployments won't run succefully unless it's set.
  After setting it, store it in GITLAB_USERNAME secret variable on GitLab for any existing projects.`);
  }
} else {
  warningMessages.push(`CI not enabled during project creation.
  Please refer the below page once you enable a CI system for this project.
  https://dx.appirio.com/docs/project-setup/ci-setup/`);
}

const orgList = 'PROD,UAT,SIT';
const orgs = [].concat(orgList.split(','));
const orgUsernames = {"PROD":"adx.unpackaged@travisci.prod","UAT":"adx.unpackaged@travisci.uat","SIT":"adx.unpackaged@travisci.sit"};
const secrets = {};
const promiseArr = [];

orgs.forEach((orgName) => {
  // Create dirs based on the orgs chosen.
  fs.ensureFileSync(path.join(pathToForceOrg, orgName, 'data', `.gitkeep_${orgName}`));
  fs.ensureFileSync(path.join(pathToForceOrg, orgName, 'filters', `.gitkeep_${orgName}`));
  fs.ensureFileSync(path.join(pathToForceOrg, orgName, 'metadata', 'classes', `DeleteMe_${orgName}.cls`));
  fs.ensureFileSync(path.join(pathToForceOrg, orgName, 'metadata', 'classes', `DeleteMe_${orgName}.cls-meta.xml`));

  // Get auth urls for the orgs
  const username = orgUsernames[orgName];
  const secretName = `SF_ORG__${orgName}__AUTH_URL`;
  const prms = getAuthURL(username, secretName)
    .then((authURL) => {
      secrets[secretName] = authURL;
    });
  promiseArr.push(prms);
});

Promise.all(promiseArr)
  .then(async () => {
    if (targetRepo && config.hasSecret('gitlab.personal_token') && config.hasUserConfig('gitlab.username') && false) {
      await writeCiConfig({
        key: 'GITLAB_USERNAME',
        body: config.readUserConfig('gitlab.username')
      });
      await writeCiConfig({
        key: 'GITLAB_TOKEN',
        body: config.getSecret('gitlab.personal_token')
      });

      // Write additional CI secrets to the CI system that should not be in .env
      if (true && config.hasSecret('sonarqube.access_token')) {
        await writeCiConfig({
          key: 'SONAR_LOGIN',
          body: config.getSecret('sonarqube.access_token')
        });
      }

      // Write all of the CI secrets from the secrets object to the CI system, without writing them to the .env file
      for (secretName in secrets) {
        await writeCiConfig({
          key: secretName,
          body: secrets[secretName]
        });
      }

      // If any secrets were not written to CI due to an error, those secrets will be written to the .env file and
      // show a warning message towards at the end of the script
      if (Object.keys(failedCISecrets).length !== 0 && failedCISecrets.constructor === Object) {
        createEnvFile(failedCISecrets);
        warningMessages.push(`We were not able to successfully send your credentials to GitLab.
  Correct your GitLab permissions and run ${colors.underline('adx ci:secret -f .env')} to configure GitLab with these credentials.
  After doing this, you can delete/empty the .env file.`);
      }
    } else {
      // If CI information is not available, secrets will be written to the .env file
      createEnvFile(secrets);
    }

    // If the .env file was not created earlier, create an empty .env file
    if (!fs.existsSync(pathToEnvFile)) {
      createEnvFile({});
    }

    try {
      console.log('. Deleting Setup Files');
      fs.removeSync(pathToSecrets);
      fs.removeSync(path.join(pathToEzbake, 'node_modules'));
      fs.unlinkSync(path.join(pathToEzbake, 'package.json'));
      fs.unlinkSync(path.join(pathToEzbake, 'yarn.lock'));
    } catch (e) {
      warningMessages.push('Failed to delete some unnecessary stuff from .ezbake directory!');
    }

    if (warningMessages.length) {
      console.log(colors.yellow('WARNING(S):'));
      warningMessages.forEach((warningMessage, index) => {
        console.log(colors.yellow(`\n  ${index + 1}: ${warningMessage}`));
      });
      console.log(colors.yellow('\n  Use the Services tab in the AppirioDX Desktop App to set any missing configurations.'));
    }
  })
  .catch((err) => {
    console.log('ERROR:', colors.red('Unable to retrieve Auth URLs for the orgs you selected! Skipping secret storage...'));
    throw err;
  });
