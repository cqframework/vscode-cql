library SimpleMeasure version '1.0.0'

using FHIR version '4.0.1'

include FHIRHelpers version '4.1.0' called FHIRHelpers

context Patient

define "isOfficial":
  exists (Patient.name Name where Name.use.value = 'official')

define "Patient Name":
  Coalesce(
    "Get Name String"(First(Patient.name Name where Name.use.value = 'official')),
    "Get Name String"(First(Patient.name Name where Name.use.value = 'usual')),
    "Get Name String"(First(Patient.name)),
    'Unknown'
  )

define function "Get Name String"(name FHIR.HumanName):
  if name is null then null
  else 
    Coalesce(
      name.text.value, 
      Combine(name.given.value, ' ') + ' ' + Coalesce(name.family.value, '')
    )

define TestAge: Age { value: decimal { value: 12.0 }, unit: string { value: 'a' }, system: uri { value: 'http://unitsofmeasure.org' }, code: code { value: 'a' } }
define TestAgeSpecificallyConverts: FHIRHelpers.ToQuantity(TestAge)
