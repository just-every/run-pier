import pkg from '../../package.json'

// Where the run site's links go: the public source repository is package.json's.
export const repository: string = pkg.repository
export const licence = `${repository}/blob/main/LICENSE`
