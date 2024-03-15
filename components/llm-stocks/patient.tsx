"use client";

import { Patient } from "@medplum/fhirtypes";
import { Link } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import Image from "next/image";

export function PatientCard({ patient }: { patient: Patient }) {
  const firstName = patient.name ? patient.name[0].family : "";
  const lastName = patient.name ? patient.name[0].given : "";
  const birthDate = patient.birthDate ? patient.birthDate : "";

  let photo = "/avatar.png";
  if (patient.photo) {
    if (patient.photo[0].url) {
      photo = patient.photo[0].url;
    }
  }

  return (
    <div className="">
      <div className="px-4 py-6 sm:px-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Image
                alt="Logo"
                className="rounded-lg"
                height="36"
                src={photo}
                style={{
                  aspectRatio: "36/36",
                  objectFit: "cover",
                }}
                width="36"
              />
              <div className="space-y-1">
                <h1 className="text-lg font-bold tracking-tight">{`${firstName} ${lastName}`}</h1>
                <p className="text-sm leading-none tracking-wide text-gray-500 dark:text-gray-400">
                  Patient ID: {patient.id}
                </p>
              </div>
            </div>
            <Button size="sm">Add Note</Button>
          </div>
          <div className="grid grid-cols-1 gap-6 md:gap-6">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Demographics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-sm font-medium leading-none text-gray-500 dark:text-gray-400">
                      Date of Birth
                    </p>
                    <p className="text-lg font-semibold leading-none">
                      {birthDate}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium leading-none text-gray-500 dark:text-gray-400">
                      Gender
                    </p>
                    <p className="text-lg font-semibold leading-none">
                      {patient.gender}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Medical History</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-none list-inside space-y-2 p-2">
                    <li>High blood pressure</li>
                    <li>Asthma</li>
                    <li>Diabetes</li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Allergies</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-none list-inside space-y-2 p-2">
                    <li>Penicillin</li>
                    <li>Codeine</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Vital Signs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                  <thead>
                    <tr>
                      <th className="pb-2 text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                        Date
                      </th>
                      <th className="pb-2 text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                        Type
                      </th>
                      <th className="pb-2 text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="font-semibold">2023-08-15</td>
                      <td>Height</td>
                      <td>165 cm</td>
                    </tr>
                    <tr>
                      <td className="font-semibold">2023-08-15</td>
                      <td>Weight</td>
                      <td>68 kg</td>
                    </tr>
                    <tr>
                      <td className="font-semibold">2023-08-15</td>
                      <td>BMI</td>
                      <td>24.98</td>
                    </tr>
                    <tr>
                      <td className="font-semibold">2023-08-15</td>
                      <td>Temperature</td>
                      <td>98.6°F</td>
                    </tr>
                    <tr>
                      <td className="font-semibold">2023-08-15</td>
                      <td>Blood Pressure</td>
                      <td>120/80 mmHg</td>
                    </tr>
                    <tr>
                      <td className="font-semibold">2023-08-15</td>
                      <td>Heart Rate</td>
                      <td>72 bpm</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Lab Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    <div>
                      <h3 className="text-lg font-semibold">
                        Complete Blood Count
                      </h3>
                      <p className="text-sm font-medium leading-none text-gray-500 dark:text-gray-400">
                        Hemoglobin, Hematocrit, Platelets
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium leading-none">
                        Ordered: Aug 1, 2023
                      </p>
                      <p className="text-sm font-medium leading-none">
                        Results: Aug 3, 2023
                      </p>
                    </div>
                  </div>
                  <Link className="text-sm font-medium underline" href="#">
                    View
                  </Link>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    <div>
                      <h3 className="text-lg font-semibold">Lipid Panel</h3>
                      <p className="text-sm font-medium leading-none text-gray-500 dark:text-gray-400">
                        Cholesterol, Triglycerides, HDL, LDL
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium leading-none">
                        Ordered: Aug 1, 2023
                      </p>
                      <p className="text-sm font-medium leading-none">
                        Results: Aug 3, 2023
                      </p>
                    </div>
                  </div>
                  <Link className="text-sm font-medium underline" href="#">
                    View
                  </Link>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    <div>
                      <h3 className="text-lg font-semibold">Urinalysis</h3>
                      <p className="text-sm font-medium leading-none text-gray-500 dark:text-gray-400">
                        Color, Appearance, Glucose, Protein
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium leading-none">
                        Ordered: Aug 1, 2023
                      </p>
                      <p className="text-sm font-medium leading-none">
                        Results: Aug 3, 2023
                      </p>
                    </div>
                  </div>
                  <Link className="text-sm font-medium underline" href="#">
                    View
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Diagnoses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <div>
                    <h3 className="text-lg font-semibold">Hypertension</h3>
                    <p className="text-sm font-medium leading-none text-gray-500 dark:text-gray-400">
                      High blood pressure
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div>
                    <h3 className="text-lg font-semibold">Asthma</h3>
                    <p className="text-sm font-medium leading-none text-gray-500 dark:text-gray-400">
                      Chronic respiratory condition
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div>
                    <h3 className="text-lg font-semibold">Diabetes</h3>
                    <p className="text-sm font-medium leading-none text-gray-500 dark:text-gray-400">
                      High blood sugar
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Procedures</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <div>
                    <h3 className="text-lg font-semibold">X-Ray</h3>
                    <p className="text-sm font-medium leading-none text-gray-500 dark:text-gray-400">
                      Imaging of bones and organs
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div>
                    <h3 className="text-lg font-semibold">EKG</h3>
                    <p className="text-sm font-medium leading-none text-gray-500 dark:text-gray-400">
                      Heart rhythm test
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div>
                    <h3 className="text-lg font-semibold">MRI</h3>
                    <p className="text-sm font-medium leading-none text-gray-500 dark:text-gray-400">
                      Detailed imaging of soft tissues
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start space-x-4">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">
                      Follow-up Appointment
                    </h3>
                    <p className="text-sm font-medium leading-none text-gray-500 dark:text-gray-400">
                      Patient advised to return in 3 months for a check-up.
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">Prescription</h3>
                    <p className="text-sm font-medium leading-none text-gray-500 dark:text-gray-400">
                      Medication for pain management.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
