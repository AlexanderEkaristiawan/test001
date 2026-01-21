import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrganizerViewReports } from './organizer-view-reports';

describe('OrganizerViewReports', () => {
  let component: OrganizerViewReports;
  let fixture: ComponentFixture<OrganizerViewReports>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizerViewReports]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OrganizerViewReports);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
