# Developers instructions #

## Running the tests locally ##

1. Make sure you have a version of [Node.js](https://nodejs.org) installed (any version >6.9 should work).

2. Make sure you have a version of [yarn](https://yarnpkg.com/) installed.

2. Install the dependencies.

  ```console
  $ yarn install
  ```

3. Run the tests!

  ```console
  $ yarn test
  ```

## Releasing a new version (needs administrator rights) ##

1. Make sure the build of the master branch is passing.

  [![Build](https://img.shields.io/travis/craft-ai/alpes/master.svg?style=flat-square)](https://travis-ci.org/craft-ai/alpes)

2. Checkout the master branch locally.

  ```console
  $ git fetch
  $ git checkout master
  $ git reset --hard origin/master
  ```

3. Increment the version in `package.json` and move _Unreleased_ section
   of `CHANGELOG.md` to a newly created section for this version.

  ```console
  $ ./scripts/update_version.sh patch
  ```

  `./scripts/update_version.sh minor` and `./scripts/update_version.sh major` are
  also available - see [semver](http://semver.org) for a guideline on when to
  use which.

  > This will create a git commit and a git tag.

5. Push everything.

  ```console
  $ git push origin master
  $ git push --tags
  ```

  > This will trigger the publishing of this new version to [npm](https://www.npmjs.com/package/craft-ai) by [travis](https://travis-ci.org/craft-ai/alpes).
