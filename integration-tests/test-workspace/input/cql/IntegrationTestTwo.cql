library IntegrationTestTwo version '1.0.0'

using FHIR version '4.0.1'
include FHIRHelpers version '4.0.1' called FHIRHelpers

context Patient

define "Has Name":
  exists(Patient.name)

define "Birth Date":
  Patient.birthDate
