library SimpleMeasure version '1.0.000'

using QICore version '6.0.0'

parameter "Measurement Period" Interval<DateTime>
  default Interval[@2026-01-01T00:00:00.000Z, @2027-01-01T00:00:00.000Z)

context Patient

define "Patient Name":
  Patient.name
