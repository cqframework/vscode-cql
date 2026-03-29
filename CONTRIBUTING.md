# Contributing to CQL for VS Code

Thank you for your interest in improving the CQL extension! This document provides guidelines for contributing to the project and instructions for setting up your development environment.

---

## Guides

See the [User Guide](https://github.com/cqframework/vscode-cql/wiki/User-Guide)
See the [Developer Guide](https://github.com/cqframework/vscode-cql/wiki/Developer-Guide) for details on how the project is designed.

## Code of Conduct

All contributors are expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md) to ensure a welcoming and inclusive community.

## Reporting Issues

- Search existing issues to see if your bug or feature request has already been reported.
- If not, open a new issue on [GitHub](https://github.com/cqframework/vscode-cql/issues).
- Provide a clear description of the problem or feature, along with steps to reproduce for bugs.
- Include your OS, VS Code version, and the version of the extension you are using.

## Development Setup

### Prerequisites

To build and run the extension locally, you will need:

- Java Development Kit (JDK) 11 or higher
- Node.js (Latest LTS recommended)
- npm (comes with Node.js)
- Visual Studio Code

### Building the Extension

1. Clone the repository: `git clone https://github.com/cqframework/vscode-cql.git`
2. Navigate to the project directory: `cd vscode-cql`
3. Install dependencies: `npm install`
4. Start the TypeScript compiler: `npm run watch` (This will watch for changes and recompile automatically).

## Running and Debugging

1. Open the project folder in VS Code.
2. Press `F5` or go to the **Run and Debug** view and select "Launch Extension".
3. A new "Extension Development Host" window will open with the local version of the extension active.
4. To debug the Java Language Server, you can attach a Java debugger to the port specified in your launch configuration (default is typically 5005).

## Pull Request Process

We follow a standard GitHub flow for contributions:

1. Fork the repository and create your branch from `master`.
2. Ensure your code follows the existing style and all builds pass.
3. Update the documentation (README or Wiki) if you are adding or changing features.
4. Submit a Pull Request (PR) with a clear description of your changes.
5. Address any feedback provided during the code review process.

## Community

If you have questions or want to discuss development before diving in:

- Join the [FHIR Zulip (CQL Stream)](https://chat.fhir.org/#narrow/stream/179220-cql).
- Check the [Project Board](https://github.com/orgs/cqframework/projects/6) for current priorities.

---

## License

Copyright 2019+ Dynamic Content Group, LLC (dba Alphora)
Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
