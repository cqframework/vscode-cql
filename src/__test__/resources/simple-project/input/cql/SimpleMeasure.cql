library SimpleMeasure version '1.0.0'

using FHIR version '4.0.1'

include FHIRHelpers version '4.1.0' called FHIRHelpers

context Patient

define "isOfficial":
  exists (Patient.name Name where Name.use.value = 'official')
