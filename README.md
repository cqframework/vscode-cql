# Clinical Quality Language (CQL) for VSCode

Adds syntax highlighting, semantic (error) highlighting, and local execution for the HL7 Clinical Quality Language (CQL) to VS Code

## Quick Start

The [cqframework.cql](https://marketplace.visualstudio.com/items?itemName=cqframework.cql) extension has been published to the VS Code Marketplace, so the installation is simple. Just search for "Clinical Quality Language" in the marketplace and install the extension. It'll be activated once you open a .cql file.

This extension requires Java to be installed. It'll prompt you to install Java if required. For windows (or java errors) follow these [instructions](Windows_Install_Setup.md).

This project maintains a [User Guide](https://github.com/cqframework/vscode-cql/wiki/User-Guide) that provides detailed instructions on how to use the plugin to author and test CQL content.

## More About the Clinical Quality Language

The Clinical Quality Language (CQL) is a domain specific language for expressing
electronic clinical quality measures (eCQM) and clinical decision support rules
(CDS) in an author-friendly computable format. Find out more about CQL:

- [CQL Specification](http://cql.hl7.org)
- [CQL Stream on FHIR Zulip Chat](https://chat.fhir.org/#narrow/stream/179220-cql)
- [clinical_quality_language on GitHub](https://github.com/cqframework/clinical_quality_language)
- [Clinical Quality Language at HL7](https://confluence.hl7.org/display/CDS/Clinical+Quality+Language)
- [Clinical Quality Framework (CQF)](https://confluence.hl7.org/display/CQIWC/Clinical+Quality+Framework)

## Getting Help

Bugs and feature requests can be filed with [Github Issues](https://github.com/cqframework/vscode-cql/issues).

The implementers are active on the official FHIR [Zulip chat for CQL](https://chat.fhir.org/#narrow/stream/179220-cql).

Inquires for commercial support can be directed to info at alphora.com

## Community

This project is being used by multiple groups as part of CQL-based artifact knowledge engineering pipelines. To support
development and maintenance of the VS Code plugin as part of those pipelines, several of these stakeholders meet regularly 
to manage issues, discuss features, and coordinate development. All the work performed by this group is managed on the 
[VSCode Plugin Project Board](https://github.com/orgs/cqframework/projects/6). Anyone with an interest in development and maintenance of the plugin is welcome to join these 
meetings. Email bryn at alphora.com to be added to the invite list.

## Related Projects

- [atom_cql_support](https://github.com/cqframework/atom_cql_support) - CQL Support for the Atom editor.
- [cql-language-server](https://github.com/cqframework/cql-language-server) - The Java and Language Server Protocol based server that powers this extension.
- [cql-translator](https://github.com/cqframework/clinical_quality_language/tree/master/Src/java/cql-to-elm) - The ELM generation component used in this project.
- [clinical-reasoning](https://github.com/cqframework/clinical-reasoning) - The Java CQL runtime environment used in the extension.

## Local Plugin Development

Install `npm`

Run `npm install` from the root

Run `npm run watch` from the root

Run the `debug` launch from VS Code

TIP: The cql-language-server that provides error highlighting is a Java project. It's also launched in debug mode when this VS Code extension is launched in debug mode, allowing you to attach a Java debugger as well. If you're simultaneously iterating on the cql-language-server, you can create a symlink to that Java artifact and changes will be picked up when VS Code restarts.

On linux:
`vscode-cql/dist/jars$ ln -s your-repo-home/cql-language-server/ls/service/target/cql-ls-service-1.5.8.jar cql-ls-service-1.5.8.jar`

Java version managers are often used. These include:

      [SDKMAN!](https://sdkman.io/)
      [jenv](https://github.com/jenv/jenv)
      [asdf](https://asdf-vm.com/)

If you are seeing something similar to:

      Starting client failed.
      Launching server using command /undefined/bin/java failed.
      Error: spawn /undefined/bin/java ENOENT

Then you will need to add the following to your shell startup file (either .zshrc or .bashrc).

For [jenv](https://github.com/jenv/jenv) users:
   `jenv add ~/.jenv/plugins/java/set-java-home.zsh`
For [asdf](https://asdf-vm.com/) Runtime Version Manager users:
   `add ~/.asdf/plugins/java/set-java-home.zsh to ~/.zshrc` (You might need to add this to ~/.bashrc if using bash or the same with other shells).
   SDKMAN! should automatically manage JAVA_HOME for you.

Set your repo home directory and update the versions as needed.

## Versioning

This project follows the guidance given by Microsoft for the VS Code marketplace [here](https://code.visualstudio.com/updates/v1_63#_publishing-prerelease-extensions) and publishes prereleases to the VS Code marketplace using odd minor version numbers. Full releases are published using even minor version numbers.

## Release Process

1. Update master to be a release version (and all the reviews, bug fixes, etc. that that requires)
    1. Update package.json - version to X.X.X (e.g. `0.7.7`)
2. Passed CI Build = ready for release
3. Follow the instructions here [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) to publish the extension.
4. Create a github release (specify a tag of `vX.X.X` (e.g. `v0.7.7`) pointing at master to be created on release)
    1. Choose the "Auto-generate release notes" option
    2. Provide any additional detail/cleanup on the release notes
5. Update masster version to the next snapshot version `X.X.X-SNAPSHOT` (e.g. 0.7.8-SNAPSHOT)
6. Close all issues included in the release

## Acknowledgements

This plugin is a reimplementation of much of the functionality in the [atom_cql_support](https://github.com/cqframework/atom_cql_support) plugin for the Atom editor. Additionally, the Red Hat [vscode-java](https://github.com/redhat-developer/vscode-java) plugin was referenced extensively in developing this plugin.

## License

Copyright 2019+ Dynamic Content Group, LLC (dba Alphora)

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

<http://www.apache.org/licenses/LICENSE-2.0>

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
