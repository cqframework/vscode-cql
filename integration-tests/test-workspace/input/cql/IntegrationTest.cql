library IntegrationTest version '1.0.0'

using FHIR version '4.0.1'
include FHIRHelpers version '4.0.1' called FHIRHelpers

context Patient

define "Patient Name":
  Patient.name.first().family

define "Patient Active":
  Patient.active

define "Age In Years":
  AgeInYears()
