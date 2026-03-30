# Clinical Quality Language (CQL) for VSCode

[![UserGuide](https://img.shields.io/badge/CQL_Extension-User_Guide-olive.svg?style=flat)](https://github.com/cqframework/vscode-cql/wiki/User-Guide)
[![DeveloperGuide](https://img.shields.io/badge/CQL_Extension-Developer_Guide-blue.svg?style=flat)](https://github.com/cqframework/vscode-cql/wiki/Developer-Guide)
[![Zulip](https://img.shields.io/badge/Zulip-CQL_Chat-mediumpurple.svg?style=flat)](https://chat.fhir.org/#narrow/channel/179220-cq)

[The VS Code CQL extension](https://marketplace.visualstudio.com/items?itemName=cqframework.cql) provides syntax highlighting, semantic (error) highlighting, and local execution for [HL7 Clinical Quality Language (CQL)](http://cql.hl7.org).

## Requirements

* Visual Studio Code 1.90 or newer
* Java 11 or newer

## Quick Start

The [cqframework.cql](https://marketplace.visualstudio.com/items?itemName=cqframework.cql) extension has been published to the VS Code Marketplace, so the installation is simple. Just search for "Clinical Quality Language" in the marketplace and install the extension. It'll be activated once you open a .cql file.

This extension requires Java to be installed. It'll prompt you to install Java if required. For windows (or java errors) follow these [instructions](Windows_Install_Setup.md).

This project maintains a [User Guide](https://github.com/cqframework/vscode-cql/wiki/User-Guide) that provides detailed instructions on how to use the plugin to author and test CQL content.

## More About the Clinical Quality Language

The Clinical Quality Language (CQL) is a domain specific language for expressing
electronic clinical quality measures (eCQM) and clinical decision support rules
(CDS) in an author-friendly computable format. Find out more about CQL:

* [CQL Specification](http://cql.hl7.org)
* [CQL Stream on FHIR Zulip Chat](https://chat.fhir.org/#narrow/stream/179220-cql)
* [clinical_quality_language on GitHub](https://github.com/cqframework/clinical_quality_language)
* [Clinical Quality Language at HL7](https://confluence.hl7.org/display/CDS/Clinical+Quality+Language)
* [Clinical Quality Framework (CQF)](https://confluence.hl7.org/display/CQIWC/Clinical+Quality+Framework)

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

- [cql-language-server](https://github.com/cqframework/cql-language-server) - The Java and Language Server Protocol based server that powers this extension.
- [cql-translator](https://github.com/cqframework/clinical_quality_language/tree/master/Src/java/cql-to-elm) - The ELM generation component used in this project.
- [clinical-reasoning](https://github.com/cqframework/clinical-reasoning) - The Java CQL runtime environment used in the extension.
- [atom_cql_support](https://github.com/cqframework/atom_cql_support) - CQL Support for the Atom editor.

## Development

Development details can be found in the [Developer Guide](https://github.com/cqframework/vscode-cql/wiki/Developer-Guide).

## Acknowledgements

This plugin is a reimplementation of much of the functionality in the [atom_cql_support](https://github.com/cqframework/atom_cql_support) plugin for the Atom editor. Additionally, the Red Hat [vscode-java](https://github.com/redhat-developer/vscode-java) plugin was referenced extensively in developing this plugin.

## License

Copyright 2019+ Dynamic Content Group, LLC (dba Alphora)

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

<http://www.apache.org/licenses/LICENSE-2.0>

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
