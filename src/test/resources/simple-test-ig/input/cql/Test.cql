library Test version '4.0.1'

using QICore version '4.1.1'

include FHIRHelpers version '1.0.2' called FHIRHelpers

valueset "V2 Discharge Disposition ValueSet" : 'http://example.org/ValueSet/v2-0112'

context Patient
 
define "Test Expression": [Encounter: "V2 Discharge Disposition ValueSet"]
define "Test & #\"SpecialChars\"": [Encounter/*: "V2 Discharge Disposition ValueSet"*/]
        // Test & #\\"SpecialChars\\"
define "Initial Population": true
define "Denominator": true
define "Numerator": false