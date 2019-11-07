const {
  exec,
  execSync
} = require('child_process');

console.log('. Installing required dependencies...');
execSync('yarn install', {
  cwd: __dirname
});
console.log('. Finished installing required dependencies');

const inquirer = require('inquirer');
const colors = require('ansi-colors');
const ui = new inquirer.ui.BottomBar();

let _answers;
let orgsLoaded = false;
let orgArray = [];
const devhubArray = [];
const allOrgs = {};
const appirio = {
  gitLabUrl: 'https://gitlab.appirio.com',
  sonarQubeUrl: "https://sonar.appirio.com"
};

const fetchAllOrgs = async () => {
  exec('sfdx force:org:list --json', (err, out, stderr) => {
    if (err) {
      throw err;
    }
    const orgJSON = JSON.parse(out).result;
    orgJSON.nonScratchOrgs.forEach((org) => {
      if (org.connectedStatus === 'Connected' || org.connectedStatus === 'ECONNRESET') {
        const alias = org.alias || org.username;
        if (org.isDevHub) {
          devhubArray.push(alias);
        }
        orgArray.push(alias);
        allOrgs[alias] = org.username;
      }
    });
    orgJSON.scratchOrgs.forEach((org) => {
      if (org.status === 'Active') {
        const alias = org.alias || org.username;
        orgArray.push(alias);
        allOrgs[alias] = org.username;
      }
    });
    orgsLoaded = true;
  });
};

const checkOrgLoading = () => {
  return new Promise((resolve, reject) => {
    const loader = ['/', '|', '\\', '-'];
    let i = 4;
    let timeout;
    const foo = () => {
      clearTimeout(timeout);
      if (!orgsLoaded) {
        ui.updateBottomBar('\n  ' + colors.yellow(loader[i++ % 4] + ' Still working to retrieve list of your authorized orgs...\n\n'));
        timeout = setTimeout(foo, 200);
      } else {
        ui.updateBottomBar('');
        ui.writeLog('\n  . ' + colors.green('Org list retrieved successfully!\n'));
        resolve();
      }
    };
    foo();
  });
};

const getOrgList = () => {
  return orgArray;
};

const logSelectedOrg = (orgName, selectedOrg) => {
  _answers._orgUsernames = _answers._orgUsernames || {};
  _answers._orgUsernames[orgName] = allOrgs[selectedOrg];
};

const filterOrgList = (orgName, isDevhub) => {
  return (selectedOrg) => {
    logSelectedOrg(orgName, selectedOrg);
    if (!isDevhub) {
      orgArray = orgArray.filter(value => {
        return value !== selectedOrg;
      });
    }
    return selectedOrg;
  }
};

const validateOrg = (alias, org) => {
  alias = alias.toUpperCase();
  if (/^[A-Z0-9]+$/i.test(alias)) {
    if (org !== alias && _answers.orgs.includes(alias)) {
      return `You've already chosen ${alias} for another org, please select a different name for ${org}`;
    }
    _answers.orgs = _answers.orgs.replace(org, alias);
    _answers._orgUsernames[alias] = _answers._orgUsernames[org];
    delete _answers._orgUsernames[org];
    return true;
  }
  return 'Name should be a single word with only letters and numbers';
};

module.exports = {
  source: {
    "**/config/*": true,
    "**/.gitlab-ci.yml": true,
    "**/.ezbake/scripts/ezbaker.js": true,
    "**/.ezbake/scripts/secrets.js": true,
    "**/sfdx-project.json": false
  },
  ingredients: [{
      "type": "input",
      "name": "haveAuthorizedOrgs",
      "message": "Have you authorized the orgs you intend to use in this project? (Yes/No)",
      "default": "No",
      validate: function (answer, answers) {
        if (answer.trim().toUpperCase() !== 'YES') {
          return 'You should open a new terminal window to authorize the orgs, before you can proceed here.';
        }
        /* Get a reference to inquirer answers hash, as we need to use the same with list input. Why??
        Because, inquirer answers hash is not available in the filter method for list input.
        We get a hold of the reference here modify the same later when needed. */
        _answers = answers || {};
        ui.writeLog('\n  . ' + colors.yellow('Initializing process to retrieve list of your authorized orgs...\n'));
        fetchAllOrgs()
          .catch(err => {
            throw err;
          })
        return true;
      }
    },
    {
      type: "confirm",
      name: "usesCMC",
      message: "Will your project use CMC?",
      default: true,
      filter: response => {
        return response ? 1 : 0;
      }
    },
    {
      type: "input",
      name: "CMCProduct",
      message: "What is the exact name of your 'Product' in CMC?",
      validate: function (answer) {
        if (answer == '') {
          return 'You must provide the CMC Product name';
        }
        return true;
      },
      when: function (answers) {
        return answers.usesCMC != false;
      }
    },
    {
      type: "list",
      name: "continuousIntegrationType",
      message: "Which CI System would you like to use?",
      choices: ["GitLab CI", "None"],
      default: "GitLab CI",
      filter: response => {
        return {
          'GitLab CI': 'gitlab',
          'None': 'none'
        } [response];
      }
    },
    {
      type: "input",
      name: "continuousIntegrationURL",
      message: "What is the URL of your CI system?",
      when: answers => {
        return answers.continuousIntegrationType !== 'none';
      },
      default: appirio.gitLabUrl
    },
    {
      type: "input",
      name: "gitlab__personal_token",
      message: "You specified a GitLab CI server other than Appirio's standard CI server. What is the personal access token for this server?",
      when: answers => {
        answers.gitlab__personal_token = answers.gitlab__personal_token || '';
        return (answers.continuousIntegrationType === 'gitlab') &&
          !(RegExp(appirio.gitLabUrl).test(answers.continuousIntegrationURL));
      }
    },
    {
      type: "list",
      name: "enableSonarQube",
      message: "Enable quality scanning using SonarQube?",
      choices: ["Yes", "No"],
      filter: val => (val === "Yes")
    },
    {
      type: "input",
      name: "sonarUrl",
      message: "What's the URL of your SonarQube instance?",
      when: answers => {
        return answers.enableSonarQube;
      },
      default: appirio.sonarQubeUrl
    },
    {
      "type": "list",
      "name": "cleanUpBranches",
      "message": "Automatically clean up branches that have been merged?",
      when: answers => {
        answers.cleanUpBranches = answers.cleanUpBranches || '';
        return answers.continuousIntegrationType !== 'none';
      },
      choices: ["Yes", "No"],
      default: "Yes",
      filter: val => (val === "Yes")
    },
    {
      type: 'list',
      message: 'Which set of orgs will you be deploying to for your project?',
      name: 'orgs',
      choices: [{
          name: '4 (e.g.: Production, UAT, SIT, QA)',
          value: 'PROD,UAT,SIT,QA'
        },
        {
          name: '3 (e.g.: Production, UAT, SIT)',
          value: 'PROD,UAT,SIT'
        },
        {
          name: '2 (e.g.: Production, UAT)',
          value: 'PROD,UAT'
        },
        {
          name: '1 (e.g.: Production)',
          value: 'PROD',
          checked: true
        }
      ],
    },
    {
      "type": "list",
      "name": "PROD_ORG",
      "message": "Please select the PROD org",
      choices: async function () {
        const x = await checkOrgLoading();
        return orgArray;
      },
      filter: filterOrgList('PROD'),
      when: function (answers) {
        return answers.orgs.includes('PROD');
      }
    },
    {
      "type": "list",
      "name": "UAT_ORG",
      "message": "Please select the UAT org",
      "choices": getOrgList,
      filter: filterOrgList('UAT'),
      when: function (answers) {
        return answers.orgs.includes('UAT');
      }
    },
    {
      "type": "list",
      "name": "SIT_ORG",
      "message": "Please select the SIT org",
      "choices": getOrgList,
      filter: filterOrgList('SIT'),
      when: function (answers) {
        return answers.orgs.includes('SIT');
      }
    },
    {
      "type": "list",
      "name": "QA_ORG",
      "message": "Please select the QA org",
      "choices": getOrgList,
      filter: filterOrgList('QA'),
      when: function (answers) {
        return answers.orgs.includes('QA');
      }
    },
    {
      type: "confirm",
      name: "changeOrgNames",
      message: "Do you want to change the default org names for the orgs you've selected?",
      default: false,
      filter: response => {
        return response ? 1 : 0;
      }
    },
    {
      type: "input",
      name: "PROD_alias",
      message: "Give a short name for the PROD org?",
      default: "PROD",
      when: answers => answers.changeOrgNames != false && answers.orgs.includes('PROD'),
      validate: alias => validateOrg(alias, 'PROD'),
    },
    {
      type: "input",
      name: "UAT_alias",
      message: "Give a short name for the UAT org?",
      default: "UAT",
      when: answers => answers.changeOrgNames != false && answers.orgs.includes('UAT'),
      validate: alias => validateOrg(alias, 'UAT'),
    },
    {
      type: "input",
      name: "SIT_alias",
      message: "Give a short name for the SIT org?",
      default: "SIT",
      when: answers => answers.changeOrgNames != false && answers.orgs.includes('SIT'),
      validate: alias => validateOrg(alias, 'SIT'),
    },
    {
      type: "input",
      name: "QA_alias",
      message: "Give a short name for the QA org?",
      default: "QA",
      when: answers => answers.changeOrgNames != false && answers.orgs.includes('QA'),
      validate: alias => validateOrg(alias, 'QA'),
    },
    {
      type: "list",
      name: "sourceBranchToClone",
      message: "Which branch do you want to create new feature branches from?",
      choices: (answers) => {
        let org_list = answers.orgs.split(',');
        return (org_list.length >= 3) ? [org_list[org_list.length - 1], "master"] : ["master"];
      },
      default: (answers) => {
        let org_list = answers.orgs.split(',');
        return (org_list.length >= 3) ?
          org_list[org_list.length - 1] :
          "master";
      },
    }
  ],
  icing: [{
      description: 'Running Yarn Install so we can do some fancy stuff for you',
      cmd: ['yarn', 'install'],
      cmdOptions: {
        shell: true,
        cwd: '.ezbake/scripts'
      }
    },
    {
      description: 'Creating a CI Configuration file',
      cmd: [`<% if(continuousIntegrationType !== 'none') { return 'node' } else { return 'echo "  Not Required"' } %>`,
        `<% if(continuousIntegrationType !== 'none') { return '.ezbake/scripts/ezbaker.js' } else { return } %>`
      ],
      cmdOptions: {
        shell: true,
      }
    },
    {
      description: 'Writing secret variables to local .env file and/or to GitLab CI',
      cmd: ['node', '.ezbake/scripts/secrets.js'],
      cmdOptions: {
        shell: true,
      }
    },
    {
      description: 'Storing GitLab personal token (if applicable)',
      cmd: [`<% if(gitlab__personal_token) { return 'adx' } else { return 'echo "  Not Required"' } %>`,
        `<% if(gitlab__personal_token) { return 'env:add' } else { return } %>`,
        `<% if(gitlab__personal_token) { return '-k' } else { return } %>`,
        `<% if(gitlab__personal_token) { return 'GITLAB_TOKEN' } else { return } %>`,
        `<% if(gitlab__personal_token) { return '-b' } else { return } %>`,
        `<% if(gitlab__personal_token) {%><%= gitlab__personal_token %><%} else { return } %>`
      ],
      cmdOptions: {
        shell: true,
      }
    },
    {
      description: 'Creating SonarQube configuration files (if required)',
      cmd: [`<% if(enableSonarQube) { return 'adx' } else { return 'echo "  Not Required"' } %>`,
        `<% if(enableSonarQube) { return 'sonar:config' } else { return } %>`,
        `<% if(enableSonarQube) { return '--flags' } else { return } %>`,
        `<% if(enableSonarQube) {%>sonar.host.url=<%= sonarUrl %><%} else { return } %>`
      ],
      cmdOptions: {
        shell: true,
      }
    },
    {
      description: 'Adding project to list of AppirioDX projects',
      cmd: ['adx', 'project:add', '--name', '<%= projectName %>'],
      cmdOptions: {
        shell: true,
      }
    }
  ]
}
